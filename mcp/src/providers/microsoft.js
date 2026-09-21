// Outlook / Microsoft 365 via Graph REST + fetch.
//
// Presents the same function surface as the Google provider so index.js does
// not branch per provider. Where Graph has no direct equivalent — Gmail labels
// are Graph categories plus folders plus an isRead flag — the mapping is made
// explicit below rather than hidden.

import { accessToken } from "../auth.js";

const API = "https://graph.microsoft.com/v1.0/me";

async function call(account, path, { method = "GET", params, body } = {}) {
  const token = await accessToken(account);

  // Built by hand rather than with URLSearchParams: that encodes spaces as "+",
  // and Graph's OData parser expects %20 in $filter and $orderby expressions.
  const qs = Object.entries(params ?? {})
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  const url = API + path + (qs ? `?${qs}` : "");

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return {};
  if (!res.ok) throw new Error(`Graph ${res.status} on ${path}: ${await res.text()}`);
  return res.json();
}

const addr = (x) => x?.emailAddress?.address ?? "";

export async function searchMessages(account, { query, unread_only, newer_than_days, from_address, limit = 10 }) {
  const select = "id,conversationId,subject,from,receivedDateTime,bodyPreview,isRead";
  const params = { $top: Math.min(limit, 25), $select: select };

  // Graph rejects $search combined with $filter or $orderby, so a free-text
  // query and the structured filters are mutually exclusive.
  if (query) {
    params.$search = `"${query}"`;
  } else {
    const filters = [];
    if (unread_only) filters.push("isRead eq false");
    if (newer_than_days) {
      const since = new Date(Date.now() - newer_than_days * 864e5).toISOString();
      filters.push(`receivedDateTime ge ${since}`);
    }
    if (from_address) filters.push(`from/emailAddress/address eq '${from_address}'`);
    if (filters.length) params.$filter = filters.join(" and ");
    params.$orderby = "receivedDateTime desc";
  }

  const data = await call(account, "/messages", { params });
  return {
    account: account.id,
    email: account.email,
    count: (data.value ?? []).length,
    messages: (data.value ?? []).map((m) => ({
      id: m.id,
      thread_id: m.conversationId,
      from: addr(m.from),
      subject: m.subject ?? "",
      date: m.receivedDateTime,
      snippet: m.bodyPreview ?? "",
      unread: m.isRead === false,
    })),
  };
}

export async function getMessage(account, { id }) {
  const m = await call(account, `/messages/${id}`, {
    params: { $select: "id,conversationId,subject,from,toRecipients,receivedDateTime,body,categories,isRead" },
  });
  return {
    account: account.id,
    id: m.id,
    thread_id: m.conversationId,
    from: addr(m.from),
    to: (m.toRecipients ?? []).map(addr).join(", "),
    subject: m.subject ?? "",
    date: m.receivedDateTime,
    labels: m.categories ?? [],
    body: (m.body?.content ?? "").slice(0, 20000),
  };
}

// Graph has no single "labels" concept. Folders are where a message lives;
// categories are the closest thing to Gmail labels. Both are returned so the
// model can see what is addressable.
export async function listLabels(account) {
  const folders = await call(account, "/mailFolders", { params: { $top: 50 } });

  // Categories live behind MailboxSettings.Read, which Geoffrey does not
  // request — it is a broader grant than a convenience feature deserves.
  // Folders are the part that matters, so a missing category list degrades
  // rather than failing the whole call.
  let categories = [];
  let categoryNote = "";
  try {
    const cats = await call(account, "/outlook/masterCategories");
    categories = (cats.value ?? []).map((c) => ({
      id: c.displayName, name: c.displayName, type: "category",
    }));
  } catch {
    categoryNote = " Categories unavailable (needs MailboxSettings.Read); folders only.";
  }

  return {
    account: account.id,
    labels: [
      ...(folders.value ?? []).map((f) => ({ id: f.id, name: f.displayName, type: "folder" })),
      ...categories,
    ],
    note:
      "Outlook folders are locations; categories are tags. Use UNREAD for read " +
      "state and INBOX for archiving." + categoryNote,
  };
}

// Keeps the Gmail-shaped contract working across providers:
//   remove UNREAD -> mark read      add UNREAD  -> mark unread
//   remove INBOX  -> move to archive
//   anything else -> Outlook category
export async function modifyLabels(account, { message_id, add = [], remove = [] }) {
  const patch = {};
  if (remove.includes("UNREAD")) patch.isRead = true;
  if (add.includes("UNREAD")) patch.isRead = false;

  const cats = new Set(
    (await call(account, `/messages/${message_id}`, { params: { $select: "categories" } })).categories ?? []
  );
  for (const a of add) if (a !== "UNREAD" && a !== "INBOX") cats.add(a);
  for (const r of remove) if (r !== "UNREAD" && r !== "INBOX") cats.delete(r);
  patch.categories = [...cats];

  await call(account, `/messages/${message_id}`, { method: "PATCH", body: patch });

  let moved;
  if (remove.includes("INBOX")) {
    moved = await call(account, `/messages/${message_id}/move`, {
      method: "POST",
      body: { destinationId: "archive" },
    });
  }

  return {
    account: account.id,
    id: moved?.id ?? message_id,
    labels: patch.categories,
    archived: Boolean(moved),
  };
}

// Draft only. No send, matching the Google provider and architecture rule 5.
export async function createDraft(account, { to, subject, body, reply_to_message_id }) {
  if (reply_to_message_id) {
    const draft = await call(account, `/messages/${reply_to_message_id}/createReply`, { method: "POST" });
    await call(account, `/messages/${draft.id}`, {
      method: "PATCH",
      body: { body: { contentType: "Text", content: body } },
    });
    return {
      account: account.id,
      draft_id: draft.id,
      thread_id: draft.conversationId,
      note: "Reply draft saved to Outlook. It has NOT been sent — review and send it yourself.",
    };
  }
  const draft = await call(account, "/messages", {
    method: "POST",
    body: {
      subject,
      body: { contentType: "Text", content: body },
      toRecipients: [{ emailAddress: { address: to } }],
    },
  });
  return {
    account: account.id,
    draft_id: draft.id,
    thread_id: draft.conversationId,
    note: "Draft saved to Outlook. It has NOT been sent — review and send it yourself.",
  };
}

export async function listCalendars(account) {
  const data = await call(account, "/calendars", { params: { $top: 50 } });
  return {
    account: account.id,
    calendars: (data.value ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      primary: c.isDefaultCalendar ?? false,
      timezone: undefined,
    })),
  };
}

export async function listEvents(account, { calendar_id, time_min, time_max, limit = 10 }) {
  const start = time_min ?? new Date().toISOString();
  const end = time_max ?? new Date(Date.now() + 30 * 864e5).toISOString();
  const path = calendar_id && calendar_id !== "primary"
    ? `/calendars/${calendar_id}/calendarView`
    : "/calendarView";
  const data = await call(account, path, {
    params: {
      startDateTime: start,
      endDateTime: end,
      $top: Math.min(limit, 25),
      $orderby: "start/dateTime",
      $select: "id,subject,start,end,location,attendees,organizer",
    },
  });
  return {
    account: account.id,
    calendar: calendar_id ?? "primary",
    count: (data.value ?? []).length,
    events: (data.value ?? []).map((e) => ({
      id: e.id,
      summary: e.subject ?? "(no title)",
      start: e.start?.dateTime,
      end: e.end?.dateTime,
      location: e.location?.displayName,
      attendees: (e.attendees ?? []).map((a) => addr(a)),
      organizer: addr(e.organizer),
    })),
  };
}

export async function profile(account) {
  return call(account, "", { params: { $select: "mail,userPrincipalName,displayName" } });
}
