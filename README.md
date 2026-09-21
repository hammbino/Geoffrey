# Geoffrey

A personal assistant someone can actually get running: it reads all of their
mailboxes and calendars, remembers their life in plain files, and works the same
from a terminal, from Claude Desktop, and from a phone.

Three pieces. Each installs somewhere different, so each is its own thing.

| | What it is | Where it installs |
|---|---|---|
| `assistant-template/` | The assistant, and its memory | Cloned into a private repo per person |
| `plugin/` | The behavior — one skill | `/plugin marketplace add`, or Customize → Plugins |
| `mcp/` | The capabilities — every mailbox behind one connector | `claude mcp add`, or a `.mcpb` for Claude Desktop |

## How the three surfaces stay in sync

Memory is a git repository, so all three read the same files:

- **Claude Code, local** — opens the folder.
- **Claude app, Code tab** — clones the same repo into a cloud session. This is
  how the phone works, and it needs nothing hosted.
- **Claude Desktop / web chat** — the plugin's skill plus the Geoffrey connector.

## Rules that are not up for renegotiation

1. **The server never calls an LLM.** All inference happens in the user's own
   client, on their own subscription. Their login, always — Anthropic's terms
   forbid a third party collecting or intermediating Claude credentials.
2. **Tools return references, not payloads.** Lists give ids and subjects; full
   bodies only on an explicit fetch. Context bloat degrades reasoning and a cap
   hit mid-task breaks the assistant.
3. **Every tool names its account.** No implicit current mailbox. Omitting the
   account is an error, never a default.
4. **Memory is plain files.** Independence comes from portability, not from
   making people run infrastructure.
5. **No send tool.** Gmail offers no draft-without-send scope, so the boundary
   lives in the tool surface. Draft and label; a human sends.

## Where things stand

Multi-account Gmail works (`mcp/`). Google's 7-day token expiry is confirmed to
be a Testing-status behavior only — an unverified In-Production client held its
refresh token for 14 days, so one published OAuth client can serve up to 100
people with no console work by any of them.

Next: calendar, then the setup command. See `docs/distribution-research.md` for
the full picture and `docs/architecture.md` for why the shape is what it is.
