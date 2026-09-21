// Gmail via REST + fetch. No SDK on purpose: this code moves to a Cloudflare
// Worker unchanged, and googleapis does not run there.

import { accessToken } from "../auth.js";

const API = "https://gmail.googleapis.com/gmail/v1/users/me";

async function call(account, path, params) {
  const token = await accessToken(account);
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v === undefined || v === null) continue;
    // Gmail expects repeated keys for list params (metadataHeaders=A&metadataHeaders=B),
    // not one comma-joined value.
    if (Array.isArray(v)) v.forEach((item) => url.searchParams.append(k, String(item)));
    else url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw new Error(`Gmail ${res.status} on ${path}: ${await res.text()}`);
  }
  return res.json();
}

const header = (msg, name) =>
  msg.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

// Rule 2: lists return references, never bodies. Full text requires an explicit
// get_message on one id.
export async function searchMessages(account, { query, unread_only, newer_than_days, from_address, limit = 10 }) {
  // Structured filters are translated into Gmail's dialect here so callers can
  // ask the same question of Gmail and Outlook without knowing either syntax.
  const parts = [];
  if (unread_only) parts.push("is:unread");
  if (newer_than_days) parts.push(`newer_than:${newer_than_days}d`);
  if (from_address) parts.push(`from:${from_address}`);
  if (query) parts.push(query);

  const list = await call(account, "/messages", {
    q: parts.join(" ") || undefined,
    maxResults: Math.min(limit, 25),
  });
  const ids = (list.messages ?? []).map((m) => m.id);

  const summaries = await Promise.all(
    ids.map(async (id) => {
      const msg = await call(account, `/messages/${id}`, {
        format: "metadata",
        "metadataHeaders": ["Subject", "From", "Date"],
      });
      return {
        id,
        thread_id: msg.threadId,
        from: header(msg, "From"),
        subject: header(msg, "Subject"),
        date: header(msg, "Date"),
        snippet: msg.snippet ?? "",
        unread: (msg.labelIds ?? []).includes("UNREAD"),
      };
    })
  );

  return { account: account.id, email: account.email, count: summaries.length, messages: summaries };
}

function decodeBody(payload) {
  if (!payload) return "";
  const fromData = (d) =>
    d ? Buffer.from(d.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8") : "";

  if (payload.body?.data) return fromData(payload.body.data);

  // Multipart: prefer text/plain, fall back to the first part that has data.
  const parts = payload.parts ?? [];
  const plain = parts.find((p) => p.mimeType === "text/plain" && p.body?.data);
  if (plain) return fromData(plain.body.data);
  for (const p of parts) {
    const nested = decodeBody(p);
    if (nested) return nested;
  }
  return "";
}

export async function getMessage(account, { id }) {
  const msg = await call(account, `/messages/${id}`, { format: "full" });
  return {
    account: account.id,
    id: msg.id,
    thread_id: msg.threadId,
    from: header(msg, "From"),
    to: header(msg, "To"),
    subject: header(msg, "Subject"),
    date: header(msg, "Date"),
    labels: msg.labelIds ?? [],
    body: decodeBody(msg.payload).slice(0, 20000),
  };
}

export async function profile(account) {
  return call(account, "/profile");
}

// --- Labels -----------------------------------------------------------------

export async function listLabels(account) {
  const { labels = [] } = await call(account, "/labels");
  return {
    account: account.id,
    labels: labels.map(({ id, name, type }) => ({ id, name, type })),
  };
}

// Archiving is removing INBOX. Marking read is removing UNREAD. Both go through
// here rather than getting their own tools.
export async function modifyLabels(account, { message_id, add = [], remove = [] }) {
  const token = await accessToken(account);
  const res = await fetch(`${API}/messages/${message_id}/modify`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ addLabelIds: add, removeLabelIds: remove }),
  });
  if (!res.ok) throw new Error(`Gmail ${res.status} on modify: ${await res.text()}`);
  const msg = await res.json();
  return { account: account.id, id: msg.id, labels: msg.labelIds ?? [] };
}

// --- Drafts -----------------------------------------------------------------

const b64url = (str) =>
  Buffer.from(str, "utf8").toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// Creates a draft only. There is deliberately no send function in this file —
// see architecture rule 5. A draft the human reviews is the boundary.

// RFC 5322 headers are ASCII-only. Anything else — an em dash, a curly quote, an
// accented name — must be an RFC 2047 encoded-word or it arrives as mojibake.
function encodeHeader(value) {
  if (!value) return "";
  // eslint-disable-next-line no-control-regex
  if (!/[^\x00-\x7F]/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

export async function createDraft(account, { to, subject, body, reply_to_message_id }) {
  let threadId;
  let headers = [`To: ${encodeHeader(to)}`, `Subject: ${encodeHeader(subject)}`];

  if (reply_to_message_id) {
    const original = await call(account, `/messages/${reply_to_message_id}`, {
      format: "metadata",
      metadataHeaders: ["Message-ID", "Subject", "From"],
    });
    threadId = original.threadId;
    const messageId = header(original, "Message-ID");
    if (messageId) {
      headers.push(`In-Reply-To: ${messageId}`, `References: ${messageId}`);
    }
  }

  headers.push('Content-Type: text/plain; charset="UTF-8"');
  headers.push("MIME-Version: 1.0");
  const raw = b64url(headers.join("\r\n") + "\r\n\r\n" + body);

  const token = await accessToken(account);
  const res = await fetch(`${API}/drafts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message: threadId ? { raw, threadId } : { raw } }),
  });
  if (!res.ok) throw new Error(`Gmail ${res.status} on drafts.create: ${await res.text()}`);
  const draft = await res.json();

  return {
    account: account.id,
    draft_id: draft.id,
    thread_id: draft.message?.threadId,
    note: "Draft saved to Gmail. It has NOT been sent — review and send it yourself.",
  };
}

// --- Calendar (read-only) ---------------------------------------------------

const CAL_API = "https://www.googleapis.com/calendar/v3";

async function calCall(account, path, params) {
  const token = await accessToken(account);
  const url = new URL(CAL_API + path);
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) v.forEach((i) => url.searchParams.append(k, String(i)));
    else url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 403 || res.status === 401) {
    throw new Error(
      `Calendar access denied for "${account.id}". This account was connected ` +
      `before calendar scope was added. Reconnect it:\n` +
      `  npm run add-account -- --secrets <client_secret.json> --id ${account.id}`
    );
  }
  if (!res.ok) throw new Error(`Calendar ${res.status} on ${path}: ${await res.text()}`);
  return res.json();
}

export async function listCalendars(account) {
  const { items = [] } = await calCall(account, "/users/me/calendarList");
  return {
    account: account.id,
    calendars: items.map((c) => ({
      id: c.id,
      name: c.summary,
      primary: c.primary ?? false,
      timezone: c.timeZone,
    })),
  };
}

export async function listEvents(account, { calendar_id = "primary", time_min, time_max, limit = 10 }) {
  const data = await calCall(account, `/calendars/${encodeURIComponent(calendar_id)}/events`, {
    timeMin: time_min ?? new Date().toISOString(),
    timeMax: time_max,
    maxResults: Math.min(limit, 25),
    singleEvents: true,
    orderBy: "startTime",
  });
  return {
    account: account.id,
    calendar: calendar_id,
    count: (data.items ?? []).length,
    events: (data.items ?? []).map((e) => ({
      id: e.id,
      summary: e.summary ?? "(no title)",
      start: e.start?.dateTime ?? e.start?.date,
      end: e.end?.dateTime ?? e.end?.date,
      location: e.location,
      attendees: (e.attendees ?? []).map((a) => a.email),
      organizer: e.organizer?.email,
    })),
  };
}
