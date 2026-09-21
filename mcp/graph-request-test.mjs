// Verifies the Graph requests the Microsoft provider builds, without needing
// real credentials. Catches malformed $filter / $search / PATCH bodies — the
// errors most likely to surface only after a console session.

import * as ms from "./src/providers/microsoft.js";

const calls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const u = typeof url === "string" ? url : url.toString();
  if (u.includes("oauth2")) {
    return new Response(JSON.stringify({ access_token: "fake", expires_in: 3600 }), { status: 200 });
  }
  calls.push({ url: decodeURIComponent(u), method: opts.method ?? "GET", body: opts.body });
  const path = new URL(u).pathname;
  if (path.endsWith("/messages") && (opts.method ?? "GET") === "GET") {
    return new Response(JSON.stringify({ value: [{ id: "m1", conversationId: "c1", subject: "s",
      from: { emailAddress: { address: "a@b.c" } }, receivedDateTime: "2026-09-15T00:00:00Z",
      bodyPreview: "p", isRead: false }] }), { status: 200 });
  }
  if (path.includes("masterCategories")) return new Response("forbidden", { status: 403 });
  if (path.endsWith("/mailFolders")) {
    return new Response(JSON.stringify({ value: [{ id: "f1", displayName: "Inbox" }] }), { status: 200 });
  }
  if (path.includes("/messages/") && (opts.method ?? "GET") === "GET") {
    return new Response(JSON.stringify({ categories: ["Existing"] }), { status: 200 });
  }
  return new Response(JSON.stringify({ id: "x", value: [] }), { status: 200 });
};

const acct = { id: "outlook", provider: "microsoft", email: "j@x.com",
  client_id: "cid", refresh_token: "rt", scope: "Mail.ReadWrite" };

const show = (label) => {
  const c = calls.pop();
  console.log(`${label}\n    ${c.method} ${c.url.replace("https://graph.microsoft.com/v1.0/me","")}`);
  if (c.body) console.log(`    body: ${c.body}`);
};

await ms.searchMessages(acct, { unread_only: true, newer_than_days: 7, limit: 5 });
show("structured filters ->");

await ms.searchMessages(acct, { from_address: "dana@acme.com", limit: 5 });
show("from_address ->");

await ms.searchMessages(acct, { query: "invoice", limit: 5 });
show("free-text query ->");

const labels = await ms.listLabels(acct);
calls.length = 0;
console.log(`categories 403 handled -> ${labels.labels.length} label(s); note: "${labels.note.slice(-58)}"`);

await ms.modifyLabels(acct, { message_id: "m1", add: ["Urgent"], remove: ["UNREAD"] });
const patch = calls.find((c) => c.method === "PATCH");
console.log(`mark-read + add category ->\n    PATCH body: ${patch.body}`);

calls.length = 0;
await ms.listEvents(acct, { time_min: "2026-09-15T00:00:00Z", limit: 5 });
show("calendar window ->");

globalThis.fetch = realFetch;
