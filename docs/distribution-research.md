# How to ship Geoffrey as something someone can install

Research, 2026-08-25. Updated 2026-09-02 with the token-lifetime result.
Sources verified against current Anthropic and Google docs (my training data ends
in May 2026 and every surface here moved since).

---

## 1. The decision that gates everything else

**Friends or customers?** These are two different products, and the thing that
separates them is not code — it is Google's OAuth verification.

Gmail's `gmail.modify` (the scope `geoffrey-mcp` already uses) is a **restricted**
scope. Google Calendar's `calendar.events` is **sensitive**. That classification
sets three hard limits:

| Publishing status | Users | Refresh token life | Assessment |
|---|---|---|---|
| Testing | 100 test users, added by hand | **7 days** | none |
| Production, unverified | 100 | **indefinite — measured, see below** | none |
| Production, verified | unlimited | indefinite | **CASA required if a server can touch the data** |

CASA (Cloud Application Security Assessment, run by the App Defense Alliance) is
an annual, paid, third-party assessment — roughly $540 for a Tier-2 DAST scan up
to $5,000+ where a pen test is required, repeated every 12 months. It triggers
on: *"Every app that requests access to Google users' restricted data and has the
ability to access data from or through a third-party server."*

**Measured, not inferred (2026-09-02).** The `experiments/oauth-token-lifetime`
probe in the old repo has now run 14 days against a real Gmail account on an
External, In-Production, *unverified* client with `gmail.modify`. Every daily
check refreshes the token *and* makes a live Gmail API call, so a grant that
refreshes but can't read would fail loudly. Day 14: `OK ... 71,294 messages`.
**The 7-day expiry is a Testing-status behavior only.** Publishing unverified
lifts it, at a 100-user cap and an "unverified app" warning during consent.

That is the friends tier unblocked: one OAuth client, published unverified,
client ID shipped inside the installer, up to 100 people connect any number of
mailboxes by signing in once each. No Cloud Console work by any recipient, ever.

**The consequence:** a **hosted** Geoffrey holding customers' mail needs CASA. A
**local** Geoffrey, where the OAuth tokens and the mail never leave the user's
own machine, plausibly does not trigger the server clause — but distributing it
past 100 people still needs the app verified out of Testing status, or every
user re-authenticates weekly.

**Recommendation:** build the friends version now, local-first, on the ≤100
test-user allowance. Treat the customer version as a separate funded step whose
first line item is CASA, not code. Do not let the customer version's
requirements shape the architecture you build this month — except to keep the
account registry and provider code portable, which the existing `geoffrey-mcp`
already does.

---

## 2. "An executable" can't satisfy "from their phone" — but three things do

The Claude mobile app cannot run a local MCP server and does not run Claude Code
locally. So no installer, however good, puts Geoffrey on a phone by itself.
Three real paths exist, and they are not mutually exclusive:

**a. A remote MCP connector, added on the web.** Custom connectors are available
on Free, Pro, Max, Team and Enterprise. Anthropic's docs are explicit: *"Once you
connect to a service on Claude or Claude Desktop, it will be available to use the
next time you log in to your account on Claude for iOS or Android."* Adding a
connector *from* mobile is still beta — desktop and web remain the primary path —
but a connector added once on claude.ai works in mobile chat. Free plan is capped
at one custom connector.
→ This is the phone answer for email/calendar. It requires the server to be
hosted and reachable from Anthropic's cloud (not localhost, not behind a VPN).

**b. Claude Code cloud sessions.** The Claude app's **Code** tab runs Claude Code
sessions on Anthropic-managed cloud infrastructure, against **a GitHub
repository**, and they keep running with the phone closed. This is the strongest
"Jarvis from my phone" surface available, and it is free of the OAuth problem
entirely — it needs a GitHub repo, which is a requirement you already have.

**c. Channels.** An MCP server can push messages into a running local session
from Telegram, Discord or iMessage. This is the MAKO-style interface, without
MAKO's licensing problem, but it needs the user's machine on.

---

## 3. Recommended shape: three pieces, one repo each

The old repo's mistake was one repo trying to be a product, a skill library, a
distribution pipeline and a research archive at once. Split by *what installs
where*:

### Piece 1 — a private GitHub repo per person: **the assistant itself**

This is both the "connect to a GitHub repository" requirement and the answer to
"memory across all of those things."

```
geoffrey-<name>/            (private, theirs, one per person)
├── CLAUDE.md               who they are, how Geoffrey behaves
├── memory/
│   ├── people/  projects/  decisions/  waiting/
│   └── journal/2026-08.md
└── .claude/settings.json
```

Plain markdown files in git. Every surface reads the same files:

- **Claude Code, local** — opens the folder directly.
- **Claude Code cloud / phone** — clones the same GitHub repo. This is why the
  repo is the memory substrate and not a database: cloud sessions are
  GitHub-shaped, so making memory a repo makes memory free on mobile.
- **Claude Desktop / web chat** — reads it through the GitHub connector, or
  through Geoffrey's own MCP server.

Git gives versioned memory, conflict resolution across three surfaces writing at
once, a diff of what the assistant learned, and an export that is just `git
clone`. It costs nothing and it is theirs. Anthropic's native memory is none of
those things.

(You asked for "connect to a GitHub repository" — I read that two ways: the
assistant can work on *their* repos, or a repo *is* the assistant's memory. This
design does the second and gets the first for free, since Claude Code in that
folder can reach any other repo.)

### Piece 2 — a Claude plugin: **the behavior**

One public GitHub repo with `.claude-plugin/plugin.json`. A plugin bundles
skills, MCP server definitions, agents and hooks in one installable unit, and
**both** Claude Code and the Claude apps now install them:

- Claude Code: `/plugin marketplace add hammbino/geoffrey` then `/plugin install geoffrey`
- Claude Desktop & web chat: Customize → Plugins → install or upload. *"Each
  plugin bundles skills, connectors, and sub-agents into a single package."*
  (Hooks and sub-agents only run in Cowork; skills and connectors work in chat.)

This replaces the old repo's entire `dist/*.zip` build pipeline and the
three-way skill mirroring. One source folder, one git remote, no zips.

### Piece 3 — `geoffrey-mcp`: **the capabilities**

Already built and working — multi-account mail behind one connector, because the
account is a tool argument rather than a property of the connection. That
insight is the whole product and it is worth keeping exactly as written.

Two deployments of the same code:

- **stdio, local** — today. Ships as an `.mcpb` bundle: a zip with a
  `manifest.json` that Claude Desktop installs by drag-and-drop, no JSON editing.
  Tokens stay on the user's machine. No CASA trigger.
- **HTTP + OAuth, hosted** — when phone chat matters. Cloudflare Workers is the
  right host: the Agents SDK ships an OAuth provider, and the MCP `2026-07-28`
  spec revision made servers stateless, so tools/prompts/resources run on a plain
  Worker with no Durable Object and no per-session state. Cost is pennies at this
  scale.

---

## 4. So what *is* the executable?

For friends, a signed `.app` is the wrong shape — macOS notarization is a
week of Apple bureaucracy to solve a problem `npx` already solves. Ship:

```bash
npx @nerdhero/geoffrey-setup
```

A Node CLI, published to npm, that does in order:

1. Check for / install Claude Code; run `claude login` (they sign in themselves — required, see §5).
2. Create their private `geoffrey-<name>` repo from a template via the GitHub CLI or API.
3. Clone it locally, `cd` in.
4. Run the Google OAuth flow once per mailbox — reusing `bin/add-account.js`, which already verifies the grant actually reads mail before saving. **This step hides a real fork (see §5).**
5. `claude mcp add --scope user geoffrey ...` (or `--transport http <url>` for the hosted version).
6. `/plugin marketplace add` the Geoffrey plugin.
7. Optionally emit an `.mcpb` for their Claude Desktop.
8. Print exactly two follow-ups the human must do: connect GitHub to Claude Code on the web (for the phone), and add the connector at claude.ai/settings/connectors (for mobile chat).

That is one command and two clicks — genuinely a "one executable" experience,
without shipping a binary you then have to code-sign, notarize and update.

---

### The fork inside step 4: whose Google OAuth client?

`add-account.js` takes `--secrets client_secret_XXX.json`. Whose file that is
decides what the product is:

| | Your client, shipped in the installer | Each friend makes their own |
|---|---|---|
| Their setup | one browser consent, ~30 seconds | a Google Cloud Console walkthrough |
| Capacity | every friend burns one of **your** 100 test-user slots | no shared cap |
| Consent screen | yours — "Geoffrey wants access to your Gmail" | theirs |
| Blast radius | your verification status gates all of them | isolated per person |
| Feels like | a product | a developer workflow handed to a business owner |

The second column is exactly what the old repo's rejected-alternatives table
ruled out, and it should stay ruled out. So: **your client, and the 100-slot cap
is the real ceiling on the friends tier.** That is fine for friends and is the
honest reason the customer tier needs verification rather than more installer
polish.

**The left column is now unblocked.** The 7-day expiry follows the *app's*
publishing status, not the user — and publishing unverified lifts it, as measured
above. One client, published, shipped in the installer. The right column was never
worth its friction and is now strictly worse: a friend who left their own client
in Testing would be the only person whose tokens die on day 7.

## 5. Two constraints that change the old plan

**The `setup-token` model is not available as a product.** The old architecture
doc's "what we take from MAKO" was the `claude setup-token` trick — customer's
own subscription, ~1 year token, run it on our server. Anthropic's Claude Code
legal page now forecloses that:

> *"Anthropic does not permit third-party developers to offer Claude.ai login
> into their own applications, or to route requests through Free, Pro, or Max
> plan credentials on behalf of their users. Moreover, developers may not
> collect, store, or intermediate Claude.ai credentials or session tokens —
> sign-in to a Claude account must complete through Anthropic's own flow."*

Holding a customer's `sk-ant-oat01-…` on your server is collecting and
intermediating a session token. What *is* permitted: hosting the **unmodified**
Claude Code binary and having the end user sign in themselves, under the
Commercial Terms — *"Each end user must authenticate with their own Anthropic API
key, Claude subscription plan credentials, or 3P inference provider credential."*
You also can't put "Claude" in the product name or logo.

This is survivable, and it actually simplifies the build: the customer's
subscription and the customer's login, always, on every surface. But if MAKO is
charging $297/mo to run Claude Code on a token they collected, that is a
compliance risk in their model — not a template to copy.

**Rule 5 from the old doc still holds and should be louder.** No send tool.
`gmail.modify` grants send because Google has no draft-without-send scope, so
the boundary has to live in the tool surface. Email is untrusted input; a model
with a send tool and a prompt-injection vector is how an assistant mails a
client list to an attacker. Draft and label, never send.

---

## 6. What to carry over from `~/repos/Geoffrey`, and what to leave

**Take:**
- `docs/geoffrey-architecture.md` — the densest thinking in either repo. The
  one-account-per-connector insight, tools-return-references, no-send-tool, and
  the rejected-alternatives table are all still correct and still load-bearing.
- `geoffrey-mcp/` — 483 lines, working, one Gmail account connected and one more
  configured. Slice 1 is done; don't re-derive it.
- `context-management/SKILL.md`'s category list — it converts directly into the
  `memory/` directory schema above.

**Leave:**
- Seven skills mirrored three ways (`core/skills/` + `.claude/skills/` +
  `plugins/geoffrey/skills/`) — a hand-sync burden the plugin format removes.
- `packs/`, `dist/*.zip`, `scripts/build-dist.sh` — replaced by one plugin repo.
- `reference/optimus-inventory/` — research, and rights-encumbered.
- Mauricio and Viktor. Bake a persona into a template and it stops being a
  product.

**Housekeeping:** the `geoffrey` MCP server is registered in your `.claude-nerdhero`
profile pointing at `/Users/jeffrey/Repos/Geoffrey/geoffrey-mcp/src/index.js` —
it's live in this session. If you abandon that folder, that registration breaks.
Re-point it before you delete anything. Also: `~/.geoffrey/accounts.json` holds a
live refresh token and client secret in plain text; it's chmod 600 and outside
the repo, which is right, but it is the one file worth backing up carefully and
never syncing.

---

## 7. Suggested build order

1. **New repo, three folders.** `assistant-template/`, `plugin/`, `mcp/`. Copy
   `geoffrey-mcp` in as `mcp/` unchanged. One skill, not seven.
2. **Prove the phone path costs nothing.** Push a template repo to GitHub,
   open it in Claude Code on the web, drive it from the Code tab on your phone.
   If memory-as-a-git-repo works there, the design is validated before any
   installer exists.
3. **Add calendar to the MCP server.** Sensitive, not restricted — meaningfully
   cheaper to verify than mail, and it's half of what a personal assistant does.
4. **Write `geoffrey-setup`.** Only after 2 and 3, so the installer automates a
   path you've walked by hand.
5. **Publish the real OAuth client.** Not the throwaway probe project — a
   clean one, External, In Production, unverified, `gmail.modify` plus the
   calendar scopes. This is now a known-good path rather than a bet.
6. **Hand it to one friend.** Not the plugin, not the docs — sit with them while
   they run it, and fix what breaks.
7. **Then** decide on hosting and CASA, with a real user's behavior as evidence.

## 8. Still open

- ~~**Aug 27 — the gate on the whole friends tier.**~~ **Answered 2026-09-02:**
  token alive at day 14 on an unverified In-Production client. Friends tier is
  viable. The remaining ceiling is the 100-user cap, not token lifetime.
- **What exactly does the 100-user cap count?** Google's wording is about users,
  but Geoffrey connects several mailboxes per person. If the cap counts *grants*
  rather than *people*, a friend with three mailboxes costs three slots and the
  real ceiling is closer to 30 people. Worth measuring before promising 100.
- Whether Google's server clause is read to exempt a purely local MCP server.
  Worth a written question to Google before betting the customer tier on it.
- Microsoft/Entra is a different shape entirely — multi-tenant app, admin
  consent, no CASA equivalent. Cheaper for customers, more setup per user.

---

## Sources

- [Get started with custom connectors using remote MCP](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)
- [Use connectors to extend Claude's capabilities](https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities)
- [Third party connectors with remote MCP](https://claude.com/docs/connectors/custom/remote-mcp)
- [Use plugins in Claude](https://support.claude.com/en/articles/13837440-use-plugins-in-claude)
- [Plugins reference — Claude Code](https://code.claude.com/docs/en/plugins-reference)
- [Connect Claude Code to tools via MCP](https://code.claude.com/docs/en/mcp)
- [Claude Code on mobile](https://code.claude.com/docs/en/mobile)
- [Claude Code legal and compliance](https://code.claude.com/docs/en/legal-and-compliance)
- [Build a desktop extension with MCPB](https://claude.com/docs/connectors/building/mcpb)
- [MCPB — one-click local MCP server installation](https://github.com/modelcontextprotocol/mcpb)
- [Google restricted scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)
- [Google sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification)
- [Google CASA assessment overview](https://deepstrike.io/blog/google-casa-security-assessment-2025)
- [Google OAuth refresh token 7-day limit](https://www.unipile.com/google-oauth-refresh-token/)
- [The next generation of MCP — Cloudflare](https://blog.cloudflare.com/mcp-v2/)
- [Build a Remote MCP server — Cloudflare Agents](https://developers.cloudflare.com/agents/model-context-protocol/guides/remote-mcp-server/)
