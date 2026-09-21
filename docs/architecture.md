# Geoffrey Architecture

> **Superseded in two places (2026-09-02).** Written before the distribution
> research. Two claims below were disproven and are corrected inline: the
> `setup-token` model is forbidden by Anthropic's terms, and the Aug 27 token
> question is answered. Everything else — the one-account-per-connector
> insight, the tool rules, the rejected alternatives — still stands.
> `distribution-research.md` is the current source of truth.

## What we are building

An assistant a business owner can actually get running. They connect their
accounts, it remembers their business, and it does real work across **all** their
mailboxes and calendars — not just one.

Two products, one codebase:

| Tier | What they get | Their cost | Our cost |
|---|---|---|---|
| **Connect** | Multi-account email + calendar + memory, driven from their own Claude (or Cursor, or Gemini). Portable. | ~$20/mo + their Claude sub | pennies — serverless |
| **Autonomous** | Everything above, plus scheduled work, an overnight task queue, and a Telegram interface | ~$79–99/mo + their Claude sub | $5–15/mo — scale-to-zero compute<br>**⚠ this pricing assumed the `setup-token` model; see below** |

These are not separate builds. Tier 2 is a second *runtime* pointed at the same
server. The hard part gets built once.

```
                     ┌── their Claude / Cursor / Gemini     ← Tier 1
Geoffrey MCP server ─┤
(accounts, memory)   └── hosted agent loop + Telegram       ← Tier 2
```

---

## The problem this exists to solve

**Claude's built-in connectors hold one account each.** One Gmail. One
Microsoft. Business owners routinely have three mailboxes and two calendars, and
there is no way to reach them all from one conversation.

The limit lives in Anthropic's connector UI, **not in MCP**. A custom connector
is just a URL — Claude has no idea how many accounts sit behind it. So Geoffrey
exposes one connector whose tools take an explicit account:

```
search_messages(account: "billing", query: "invoice")
search_messages(account: "clients", query: "proposal")
list_events(account: "personal")
```

OAuth for each account happens on our side, never through Claude's UI. That is
the whole trick, and it is why this is buildable at all.

---

## Reference point: MAKO (hiremako.com)

MAKO is the productized version of the Optimus curriculum. Worth understanding
because it is the closest thing to what we are building. (The Optimus inventory
notes that informed this section stayed in the old repo — research material,
rights-encumbered, not source.)

**What it is:** Claude Code running 24/7 on managed cloud infrastructure, driven
through **Telegram**. Not an MCP connector.

- Auth: the customer's own Claude subscription via `claude setup-token`
  (`sk-ant-oat01-…`, ~1 year). No API key, no metered billing.
- Memory: persistent, because Claude Code on a server has a real filesystem
- Skills: 300+ SKILL.md files preloaded
- Self-extending: the agent wires up its own integrations
- Price: **$297/mo** + their $20–200 Claude subscription

**What we take:** ~~the `setup-token` trick~~ — Telegram as the mobile
interface, and the insight that SKILL.md files are already the right format.

> **Correction (2026-09-02).** The `setup-token` trick is not available to us.
> Anthropic's Claude Code terms: developers "may not collect, store, or
> intermediate Claude.ai credentials or session tokens — sign-in to a Claude
> account must complete through Anthropic's own flow." Holding a customer's
> `sk-ant-oat01-…` on our server is exactly that. What *is* permitted is hosting
> the unmodified Claude Code binary while each end user signs in themselves,
> under the Commercial Terms. Tier 2's economics need rebuilding on that basis
> before its price means anything. If MAKO is charging $297/mo on a collected
> token, that is a risk in their model, not a template.

**Where we differ:** MAKO is Claude-Code-only, so it is Anthropic-locked. Our
capability layer is an MCP server, which ChatGPT, Gemini, Cursor, Copilot and
others speak. MCP is Linux Foundation governed — not Anthropic's to revoke.

**On their price:** $297 buys always-on autonomy. Our Tier 1 does not need that,
which is why it can be $20. And "always-on" is mostly a misnomer — the actual
described behavior ("drop 5 tasks before bed", "report every Monday 9am") is
bursty. Scale-to-zero compute that wakes on a schedule costs a fraction of a
container that never sleeps.

---

## Rules

**1. The server never calls an LLM.** All inference happens in the customer's
own client, on their subscription. This protects margin, keeps us
model-agnostic, and makes our cost scale with storage rather than usage.

**2. Tools return references, not payloads.** Lists return IDs, subjects,
senders, dates. Full bodies only on an explicit `get`. Not to save the customer
money — heavy usage is a good sign, and a Pro→Max upgrade is easy for a business
getting value. The reasons are that hitting a cap mid-task breaks the assistant,
and context bloat degrades reasoning.

**3. Every tool names its account.** No implicit "current mailbox". Omitting the
account is an error, never a default.

**4. Memory is plain files.** Human-readable, exportable, theirs. Independence
comes from portability, not from making customers run infrastructure.

**5. No send tool.** `gmail.modify` grants send because Google offers no
draft-without-send scope, so the boundary lives in the tool surface. Email is
untrusted input; a model with a send tool and a prompt-injection vector is how
an assistant mails a client list to an attacker. Draft and label, never send.

---

## Build order

### Slice 1 — multi-account mail, local (now)

A stdio MCP server on Jeffrey's Mac. Not the final form — the transport is the
only throwaway part; the account registry and provider code port directly to the
hosted version.

Tools: `list_accounts`, `search_messages`, `get_message`.

Google first, since a working OAuth client and token already exist from the
token-lifetime experiment. Microsoft needs an Entra app registration — a
separate console session, deliberately not blocking slice 1.

**Done when:** Jeffrey adds it to his own Claude and reads across two Gmail
accounts in one conversation. That is something Claude cannot do today.

### Slice 2 — Microsoft, calendars, drafts and labels

Add the Entra registration, the Graph provider, calendar tools, `create_draft`,
`modify_labels`.

### Slice 3 — hosted (Tier 1 ships)

Move to Cloudflare Workers, OAuth via the Agents SDK provider, one Durable
Object per customer. DO-per-customer is the *cheap* isolation: a shared database
needs a correct tenant filter on every query forever, and one miss leaks a
customer's business context. With one object per customer that bug is
unrepresentable.

### Slice 4 — memory

Plain JSON documents. Schema converts directly from `context-management/SKILL.md`,
which already enumerates the categories: user, business, person, project,
decision, waiting, followup, correction — plus confidence labels (confirmed,
inferred, tentative, stale). `memory_export` ships with it, not later.

### Slice 5 — Tier 2 runtime

Scale-to-zero agent loop, scheduled tasks, task queue, Telegram. **Auth is the
open problem, not the compute:** the customer must sign in to an unmodified
Claude Code themselves; we cannot hold their token. Solve that before costing
this slice.

---

## Open questions

- ~~**Aug 27:** does an unverified In-Production Google OAuth client keep its
  refresh token past day 7?~~ **Answered 2026-09-02: yes.** Fourteen days of
  daily refresh-plus-live-API checks held. The 7-day expiry is a Testing-status
  behavior only. One published unverified client serves up to 100 people.
- What does that 100-user cap actually count — people, or authorization grants?
  Geoffrey connects several mailboxes per person.
- Telegram vs another surface for Tier 2. Telegram is what MAKO proved works.

---

## Appendix: rejected alternatives

| Rejected | Why |
|---|---|
| Forward all mail into one Gmail | Read-only shadow; sent mail never arrives, so half of every thread is missing |
| Nylas / Aurinko / Unipile | Third-party custody of a consultancy's client email |
| `ms-365-mcp-server`, `google_workspace_mcp` off the shelf | Single-user local processes with OS-keychain tokens; cannot be hosted or multi-tenanted |
| Claude native memory | Anthropic-only, an uncontrolled synthesis rather than a schema |
| Desktop sandbox `/mnt/user-data/` | Anthropic-only, persistence unverified |
| Built-in Gmail/Microsoft connectors | One account each — the exact problem we exist to solve |
| Shared database with tenant filters | One missing `WHERE` leaks a customer's business context |
| Google domain-wide delegation / Workspace Marketplace | Requires an admin and an organization; customers are individuals |
| Vercel | Cloudflare already owned, better MCP + OAuth tooling |
| Customer self-deploys their own server | A developer workflow handed to a business owner |
