# geoffrey-mcp

Multi-account email for any MCP client.

Claude's built-in connectors hold **one** account each — one Gmail, one
Microsoft. This server fronts any number of mailboxes behind a single
connector, because the account is a tool argument rather than a property of the
connection.

## Tools

| Tool | Returns |
|---|---|
| `list_accounts` | Every connected mailbox: id, provider, address, purpose |
| `search_messages` | Summaries only — id, from, subject, date, snippet. Never bodies. |
| `get_message` | Full text of one message by id |
| `list_labels` | Every label in a mailbox: id, name, type |
| `modify_labels` | Applies and removes labels by name or id. Removing `INBOX` archives; removing `UNREAD` marks read. |
| `create_draft` | Saves a draft. Pass `reply_to_message_id` to thread it into an existing conversation, inheriting recipient and subject. |
| `list_calendars` | Every calendar the account can see: id, name, primary flag |
| `list_events` | Events in a window for one calendar: id, title, start, end, attendees. Summaries only. |

Every tool requires an explicit `account`. Omitting it is a validation error,
not a guess about which mailbox was meant.

`search_messages` deliberately returns no message bodies. Bodies come only from
an explicit `get_message` on one id — otherwise a single search floods the
context window, which degrades the model's reasoning and can exhaust a session
mid-task.

**There is no send tool, and `create_draft` cannot send.** `gmail.modify` grants
send capability whether we use it or not, so the boundary lives in what the
server exposes rather than in the scope. Geoffrey drafts and files; a person
sends. See `docs/architecture.md`, rule 5.

Threading is handled properly: a reply carries the original's `threadId`, an
`In-Reply-To` pointing at its `Message-ID`, and a `References` chain. Setting
only `threadId` makes Gmail file it correctly while other clients show it
detached, which is why all three are set.

## Credentials

`~/.geoffrey/accounts.json`, chmod 600 — outside the repo so it cannot be
committed by accident. Plain JSON: readable, portable, and yours.

Access tokens are never written to disk; only refresh tokens are stored, and
access tokens are minted per run and cached in memory.

## Connect a mailbox

Needs a Desktop-app OAuth client from a Google Cloud project with the Gmail API
enabled and the `gmail.modify` scope (see the token-lifetime experiment README
for the console walkthrough).

```bash
npm install
npm run add-account -- --secrets ~/Downloads/client_secret_XXX.json --id work
```

Expect an "unverified app" warning — Advanced → Go to Geoffrey (unsafe). The
script confirms the grant reaches the Gmail API before saving, so a token that
refreshes but cannot read mail fails loudly instead of silently.

Repeat per mailbox with a different `--id`.

## Use it

Register once, then it is available in every project:

```bash
claude mcp add --scope user geoffrey node /Users/jeffrey/Sandbox/Geoffrey/mcp/src/index.js
```

## Test

```bash
node smoke-test.mjs
```

Exercises the tool list, a missing account, an unknown account, a real search,
and a real message fetch.

## Status

Slice 2: Google is exercised end to end (mail, labels, drafts, calendar).
The Microsoft Graph provider in `src/providers/microsoft.js` is written but has
not yet been run against a real mailbox — `docs/outlook-setup.md` is the Entra
registration runbook that unblocks it.

This is a stdio server so it works locally today. Only the transport is
throwaway — the account registry and provider code move to the hosted Cloudflare
version unchanged.
