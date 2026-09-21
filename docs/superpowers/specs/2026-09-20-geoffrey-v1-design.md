# Geoffrey v1 — design

Written 2026-09-20 from a brainstorm that ran 2026-09-15 through 2026-09-20.
This is the spec the implementation plan is written from. `docs/distribution-
research.md` and `docs/architecture.md` carry the research and the reasoning;
where they disagree with this document, this document wins.

---

## 1. What v1 is

**Geoffrey is what Claude for Small Business should have been: the same job,
from any device, in any Claude surface, across all of a business owner's
accounts rather than one.**

Anthropic shipped Claude for Small Business on 2026-09-15: 31 skills and 43
connectors, inside the Cowork desktop app only, one Google account and one
Microsoft account per person. Geoffrey's difference is exactly the part they
did not build:

- **Every account.** Several Gmail and Microsoft 365 mailboxes, calendars, and
  Google Drives in one assistant. The built-in connectors hold one account each
  and a second replaces the first; Geoffrey makes the account a tool argument.
- **Every surface.** Claude Code on the owner's Mac, Claude Desktop, and the
  Claude phone app (chat and the Code tab). One hosted connector serves all of
  them.
- **Memory the owner owns.** Plain markdown in a private GitHub repo the owner
  can read, edit, and take with them.
- **An installer that a business owner finishes alone.** One line pasted into
  Terminal. The installer is the product; everything else is what it installs.

The owner is referred to as **the owner**. Whoever receives it first is **the
first user**. No person's name appears in any of the three installable pieces.

### What v1 delivers

| Capability | Google | Microsoft 365 |
|---|---|---|
| Mail: search, read, label, draft | yes | yes |
| Calendar: list calendars, list events | yes | yes |
| Files: find, read a doc or sheet | yes (Drive, Sheets) | no (deferred) |
| Sheets: write a range, behind the server-side boundary (§5) | yes | no (deferred) |
| Memory in the owner's repo | yes | — |
| Third-party tools (Stripe, QuickBooks, HubSpot, …) | Anthropic's connectors, offered by the installer as a click-through menu | |

### What v1 does not do

- Send email, post, pay, or delete. Ever. Draft and label; a human sends.
- Build any connector Anthropic already offers.
- Install Anthropic's Small Business plugin. It is Cowork-only and carries its
  own onboarding and memory; two assistants in one client is a worse product.
  The installer mentions it as optional for owners who use Cowork.
- OneDrive / Excel. Microsoft is mail and calendar in v1.
- Hold the owner's memory on the server. Memory is the owner's GitHub repo;
  the server reads and writes it through the GitHub API on the owner's behalf
  and stores none of it (§6).

### Acceptance test

Run by Jeffrey, on himself, on a clean macOS user account, before anyone else
sees it:

1. Paste the one line into Terminal on a Mac that has never had Claude Code,
   `gh`, or Geoffrey on it. Finish setup without consulting anything but the
   screen.
2. From the phone, in ordinary Claude chat: ask Geoffrey to compare a value in
   a sheet held in one Google account against an email in a different account.
   Geoffrey answers correctly and names both accounts.
3. Ask Geoffrey to update that sheet. Geoffrey shows the intended change, the
   owner approves, the write lands, Geoffrey shows before and after.
4. A week later, in Claude Code on the Mac, Geoffrey recalls something it
   learned in step 2 without being reminded.
5. Repeat step 2 with a Microsoft mailbox as one of the two accounts.

Every step has a checkpoint in the plan; none is "it should work."

---

## 2. What the owner experiences

Before starting the owner needs a Mac, a paid Claude plan, and a GitHub account
(free; the installer sends them to sign up and waits if they have none).

1. **One line.** They paste it into Terminal. From here the installer talks in
   plain English, one step at a time, and never moves on until the step it just
   did provably worked.
2. **"Let's get Claude on this Mac."** Installs Claude Code if missing. Opens
   the browser; the owner signs into Claude themselves — Anthropic's terms
   require it. Checkpoint: `claude` answers a trivial prompt.
3. **"A private home for what Geoffrey remembers."** Opens GitHub; the owner
   clicks Authorize. Creates their private `geoffrey-<name>` repo from the
   template, clones it to `~/Geoffrey`. Checkpoint: the clone exists and
   `memory/README.md` is readable.
4. **"Connect your accounts."** Opens the Geoffrey connect page. The owner
   signs into a Google account, then is asked *"another one?"* — Microsoft,
   another Google, until they say done. Each grant is verified with a live read
   of the inbox before it is saved. For each Google account the page then lists
   their spreadsheets and asks which ones Geoffrey may **write** to; unchecked
   sheets stay read-only forever unless the owner comes back here. Checkpoint:
   the server reports every account readable.
5. **"Teaching Claude to be Geoffrey."** Registers the hosted connector and
   installs the plugin in Claude Code. Checkpoint: from a fresh `claude`
   session, `list_accounts` returns every account connected in step 4.
6. **The two clicks the installer cannot do.** Adding the connector and the
   plugin inside the Claude apps happens at claude.ai and has no API. The
   installer prints the exact click path and the URL to paste, then waits for
   "done." This is what lights up Desktop and the phone.
7. **"What else do you run your business on?"** A menu of Anthropic's own
   connectors, in plain categories (money in, books, customers, files, team),
   each a click path at claude.ai. Nothing here is Geoffrey's code. Skippable.
8. **"Say hello."** Opens Claude Code in `~/Geoffrey` with a first prompt
   queued: Geoffrey introduces itself, asks name and time zone, reads across
   every connected account to prove they work, writes what it learned to
   `memory/user.md`, and commits.

**When a step fails**, the installer says which step, why in plain words, the
one thing to try, and the exact line to paste to resume *from that step*.
Never "start over." State lives in `~/.geoffrey/setup-state.json`; every step
is idempotent, so re-running a completed step is harmless.

Honest floor: one paste; four browser sign-ins (Claude, GitHub, Google,
Microsoft); and two flows at claude.ai, each of which is a URL to paste plus an
OAuth round trip to `GEOFFREY_URL` (which signs the owner in with GitHub
again). Adding the connector in Claude Code (step 5) triggers the same round
trip. So the owner authenticates to Geoffrey twice or three times, not zero.
Anything below this breaks Anthropic's login rule or requires hosting the
owner's memory.

---

## 3. Components

Five pieces in this repo, plus two console prerequisites.

### 3.1 `mcp/` — the server

The capabilities. Hosted on Cloudflare Workers; the same code also runs as a
stdio process for local development and tests.

- **Identity.** The owner signs into Geoffrey with GitHub. That one identity
  keys their account store, is what Claude authenticates against when the
  connector is added, and is the same account that owns their memory repo. The
  GitHub grant is scoped to that one repository, so the server can read and
  commit memory on the owner's behalf and nothing else. No Geoffrey password
  exists.
- **Storage.** One Durable Object per owner holding: provider refresh tokens,
  the GitHub token and memory-repo name, the account registry (`id`,
  `provider`, `address`, `purpose`), and the sheet-write allowlist. No memory
  content is stored on the server; it is fetched from the repo per call. Isolation per owner is structural — there is no shared
  table to mis-filter.
- **Claude ↔ Geoffrey auth.** OAuth via the Cloudflare Agents SDK provider,
  with GitHub as the upstream identity.
- **Owner ↔ provider auth.** Google and Microsoft OAuth, browser-based, on the
  connect page (§3.5). Refresh tokens stored; access tokens minted per call.
- **Two token stores, one interface.** Hosted, tokens live in the owner's
  Durable Object; the stdio path used for development and tests keeps
  `~/.geoffrey/accounts.json`. `store.js` becomes the interface both implement
  so providers and tools never know which one they are on.
- **Tools.** Every tool takes `account`. Omitting it is a validation error.

| Tool | Notes |
|---|---|
| `list_accounts` | id, provider, address, purpose |
| `search_messages`, `get_message` | exist |
| `list_labels`, `modify_labels`, `create_draft` | exist |
| `list_calendars`, `list_events` | exist |
| `search_files` | Drive: id, name, type, modified. No contents. |
| `get_file` | One file's text: Docs exported as text, Sheets as CSV of a range, others as plain text where Drive can export it. Capped. |
| `read_sheet` | A range from one sheet, as rows. |
| `update_sheet` | A range write. Refused unless the sheet is on the owner's allowlist. Returns `{before, after}`. Capped at a fixed number of cells per call. |
| `list_memory` | Paths under `memory/` in the owner's repo, with sizes. No contents. These tools take no `account`; memory belongs to the owner, not a mailbox. |
| `read_memory` | One file's text from the repo, at the current head. |
| `write_memory` | Create or replace one file under `memory/`, committed to the repo with a one-line message. Refuses any path outside `memory/`. Returns the commit sha and the previous contents. |

There is no send tool, no tool that edits the allowlist, and no tool that
writes outside `memory/`.

- **Status.** Mail, labels, drafts, calendar exist and pass the smoke test for
  Google. Microsoft provider is written, never run against a real mailbox. Drive
  and Sheets are new. Hosting, identity, and per-owner storage are new.

### 3.2 `assistant-template/` — the owner's repo

`CLAUDE.md` and `memory/` in plain markdown. Cloned as a private GitHub repo
per owner. Every surface reads the same files.

Additions for v1:

- `memory/accounts.md` — which accounts and connectors are attached, and what
  each is for, in the owner's words. Written during "say hello" and kept
  current by Geoffrey. This is how Geoffrey knows it has Stripe and what to
  reach for it for.
- The sync discipline in §6, stated in `CLAUDE.md` so every surface follows it.
- `CLAUDE.md` tells Geoffrey which memory path it is on: the local clone when
  the folder is present, the `*_memory` tools otherwise. Same files either way.

### 3.3 `plugin/` — the behavior

Skills, installed into Claude Code via the marketplace and into the Claude apps
via Customize → Plugins. The `geoffrey` skill stays the spine: own the outcome,
verify, remember, ask before anything consequential.

**Several skills are allowed.** The previous project's problem was seven skills
mirrored into three directories; the plugin format removes the mirroring. One
source of truth per skill, all under `plugin/skills/`. v1 adds SMB working
skills only where a task needs more than the spine gives it (a weekly brief, a
chase-overdue loop). Add a skill when a task keeps needing the same procedure;
don't add one speculatively.

Status: `geoffrey` written; two eval suites written and never run.

### 3.4 `setup/` — the installer

New. A small bootstrap shell script (fetched by the one line) that ensures
Node is present, then hands off to a Node CLI that runs §2. Node because a
resumable, interactive, multi-step wizard is miserable in shell and Claude
Code's own installer already proves users will paste one line.

Responsibilities: every step in §2, its checkpoint, its failure message, and
its resume line. Nothing else — it holds no credentials and calls no provider
API directly; the connect page does that.

### 3.5 The connect page — on the server

New. A few pages served by the Worker:

- Sign in with GitHub.
- Add a Google account / add a Microsoft account. Runs the provider OAuth,
  verifies the grant with a live read, saves it, shows the result.
- For each Google account: list spreadsheets, check the ones Geoffrey may write
  to. This is the only way onto the allowlist.
- List connected accounts; remove one.

The installer opens it in step 4. The owner returns to it later to add an
account or a sheet without re-running anything.

### 3.6 Prerequisites (console work, Jeffrey only)

- **One Google OAuth client**, External, In Production, unverified. Scopes:
  `gmail.modify`, `calendar.events`, `drive.readonly`, `spreadsheets`. Not the
  probe project — a clean one. The client secret lives on the server, never in
  the installer.
- **One Microsoft Entra registration**, multi-tenant plus personal accounts.
  `docs/outlook-setup.md` is the runbook.
- **A domain** for the server and connect page. Referred to below as
  `GEOFFREY_URL`; registering it is a plan task, not a design question.

---

## 4. Data flow

**A question from the phone.** Claude mobile chat → Anthropic → `GEOFFREY_URL`
(connector, authenticated as the owner via GitHub) → Worker resolves the
owner's Durable Object → mints a provider access token from the stored refresh
token → calls Gmail / Graph / Drive → returns references, not payloads. Memory
goes through the same connector: `read_memory` fetches a file from the owner's
repo via the GitHub API; `write_memory` commits one. No second connector, no
second sign-in.

**A session in Claude Code on the Mac.** Same connector over HTTP. Memory is
the local clone; the sync discipline in §6 keeps it current.

**A cloud Code session from the phone.** Anthropic's cloud clones the owner's
repo; the connector is reached over HTTP as from anywhere else. Whether a
cloud session can reach a remote MCP connector is **unverified** and is one of
the first plan tasks (§8).

**The server never calls an LLM.** All inference is in the owner's own client
on the owner's own subscription.

---

## 5. The sheet-write boundary (rule 5, extended)

Rule 5 says the boundary between reading untrusted input and taking a
consequential action lives in the tool surface, not in a prompt. Email is
untrusted input; a sheet write is a consequential action; v1 puts both in one
context window. So the boundary is enforced by the server:

1. **Allowlist.** The owner chooses writable sheets on the connect page, in
   their browser, signed in as themselves. There is no tool that adds to the
   allowlist. A model that has been told by an email to "record this in the
   vendor sheet" cannot expand its own permissions.
2. **Refusal is the default.** `update_sheet` on any sheet not on the list
   returns an error naming the connect page. It does not ask; it refuses.
3. **Every write is visible.** `update_sheet` returns the range's contents
   before and after. The `geoffrey` skill shows the intended change and gets
   approval before calling, and shows the result after. The skill rule is
   courtesy; the allowlist is the boundary.
4. **Bounded.** A fixed cap on cells per call; no sheet-wide clears; no
   formula injection — values are written as values.

`write_memory` is a write tool and follows the same reasoning: it is confined
to `memory/` in one repository the owner chose in their browser, returns the
previous contents, and is one commit — reversible by design. Email-sourced
text can pollute memory; it cannot reach anything else through it. The
`geoffrey` skill's rule to mark inferences as such is the courtesy layer on top.

The same pattern is how any future write tool (calendar event creation,
OneDrive) earns its way in: a server-side allowlist or scope the owner set in a
browser, refusal by default, the diff returned.

---

## 6. Memory: one repo, three writers

Claude Code on the Mac (local clone), a cloud Code session (its own clone), and
Desktop or mobile chat (the `*_memory` tools, committing through the GitHub
API) all write `memory/`. Git detects conflicts; it does not resolve
them, and a merge conflict in `memory/user.md` is not something an owner can be
asked to fix. The discipline, stated in the template's `CLAUDE.md`:

- **Before reading memory for real work:** `git pull --rebase`.
- **After every memory write:** commit with a one-line message saying what
  changed, then push.
- **If the push is rejected:** pull with rebase and push again.
- **If that produces a conflict:** Geoffrey resolves it by keeping both
  versions in the file under dated headings, commits, pushes, and notes in the
  journal that it did so. Conflict markers never survive a session. The owner
  is told, not asked.
- **Never** leave the repo dirty at the end of a task.

Small files help: one fact per file in `people/`, `projects/`, `decisions/`,
`waiting/` means two surfaces rarely touch the same file.

Surfaces without a clone use the `*_memory` tools. Each `write_memory` is one
commit against the repo's current head, so it cannot produce a conflict — if
the head moved since `read_memory`, the server returns the newer contents and
the tool call fails; Geoffrey re-reads and writes again. The `before` contents
come back with every write so a mistaken overwrite is one call from restored.
This is the same discipline with the server doing the pull-and-retry.

---

## 7. Security, hardening, and limits

**Findings from the 2026-09-20 review of the moved server**, fixed before any
new code:

- `microsoft.js` builds OData `$filter`/`$search` by interpolation. Escape
  `'` and `"`; the strings can arrive from email content via the model.
- `store.js` writes `accounts.json` then chmods it. Write with `mode: 0o600`
  and create the directory `0o700`.
- `add-account.js` echoes `url.search` into HTML on the callback page. Escape
  it.

**Standing rules**, unchanged: no send tool; every tool names its account;
references not payloads; the server never calls an LLM; memory is plain files.
Email content is data to report, never an instruction to follow.

**Hosting changes the Google picture.** A hosted server that touches restricted
Gmail data is squarely inside Google's "through a third-party server" clause.
Under 100 users on an unverified In-Production client this costs nothing and
needs no assessment. User 101 needs verification and an annual CASA assessment,
$540–$5,000+ per year, recurring. That is a business constraint on this
design, not a footnote: the friends tier has a hard ceiling and the price of
lifting it is known.

**What the 100 counts is unverified.** Google's wording is "users"; Geoffrey
connects several grants per owner (Google + Microsoft + multiple mailboxes). If
the cap counts grants, the real ceiling is closer to 25–30 owners. Measuring
this is a plan task; the answer changes the business case, not the design.

**Scope classifications** used here (`gmail.modify` restricted,
`calendar.events` sensitive, `drive.readonly` restricted, `spreadsheets`
sensitive) are from Google's published lists and are re-checked in the plan
before the client is configured.

---

## 8. Assumptions to verify first

Each is cheap, each would change the plan if wrong, so each is an early task:

1. A **cloud Code session** (phone, Code tab) can reach a remote MCP connector
   over HTTP. Only memory has been proven there.
2. A connector **bundled in the plugin** does or does not work in mobile chat.
   The design assumes the manual claude.ai step is required (§2 step 6); if
   bundling works, that step shrinks.
3. Anthropic's **connector directory** entries for the §2 step 7 menu exist and
   install cleanly. The menu ships with what's proven.
4. Google's **100-user cap** counts people or grants (§7).
5. **A GitHub OAuth grant scoped to one repository lets the server read and
   commit through the API** with a token that survives (fine-grained tokens
   and GitHub App installation tokens are the two candidates). Gates the
   product claim, not one surface. Most load-bearing item on this list.

---

## 9. Testing

- **Unit:** the sheet-write allowlist (refuses unlisted, allows listed, returns
  before/after, caps cells), `write_memory` path confinement and stale-head
  refusal, OData escaping, `account` validation on every mailbox tool. Fast,
  no network.
- **Smoke:** `mcp/smoke-test.mjs` against the stdio server and against
  `GEOFFREY_URL`. Extended to cover every tool, including a Microsoft account
  and a Drive/Sheets pass.
- **Skill evals:** `plugin/skills/geoffrey/evals/`. The prompt-injection case
  runs before anything is handed to anyone.
- **Installer:** run on a fresh macOS user account on Jeffrey's Mac (a clean
  Mac for the price of a login). Every step's failure path is triggered on
  purpose at least once and the resume line is followed.
- **Acceptance:** §1, in full, by Jeffrey, before the first user.

Every checkpoint in §2 is a test the installer runs on itself.

---

## 10. Build order

One slice, with checkpoints between every stage rather than handoffs. Stages,
in dependency order:

1. Harden the moved server (§7 findings). Run the existing smoke test.
2. Console prerequisites: Google client, Entra registration, `GEOFFREY_URL`.
3. Verify the four assumptions in §8.
4. Prove Microsoft locally: connect a real mailbox via `add-account.js`, extend
   the smoke test.
5. Drive and Sheets locally: `search_files`, `get_file`, `read_sheet`,
   `update_sheet` with the allowlist, unit-tested.
6. Host: Worker, per-owner Durable Object, GitHub identity, Claude OAuth, the
   three `*_memory` tools. Smoke test against `GEOFFREY_URL`, including a
   memory round trip from a surface with no clone.
7. Connect page.
8. Template additions and the sync discipline. Plugin skill updates.
9. Installer, step by step, each with its checkpoint and failure path.
10. Run the evals. Run the acceptance test on a clean user account.
11. Hand to the first user, in person. Fix what breaks. Only then, the next
    version.

Each stage ends with something running that didn't run before, and a
verification that it does.
