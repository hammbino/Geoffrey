# Phone and identity spikes

**Run these before deciding the build order.** Six questions, all answerable in
one day with what exists today. Five of the eight assumptions in the v1 spec
(`docs/superpowers/specs/2026-09-20-geoffrey-v1-design.md`, §8) are phone or
identity questions, and every one of them changes what gets built. One of them
could remove half the work from v1.

Each spike says what to do, what you should see, and what the answer changes.
Record the result in the box at the bottom of each spike. "It should work" is
not a result.

Spike 1 builds the fixture the next three use, so it goes first. Spike 6 is
independent and can be done any time.

---

## Spike 1. A hello-world MCP server on a public URL

**Question:** can we put an MCP server on a URL that Anthropic's cloud can
reach? Everything about the hosted design assumes yes, and nothing had been
deployed.

**Answer: yes.** Run 2026-09-23. Deployed, verified from the public internet,
and it needed no Cloudflare login.

**Live URL:** `https://geoffrey-spike.tarry-settee.workers.dev`
**MCP endpoint:** `https://geoffrey-spike.tarry-settee.workers.dev/mcp`

### What was built

`~/geoffrey-spike`, a plain Worker with one tool. Source in `src/index.js`:

```javascript
import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import { z } from "zod";

function buildServer() {
  const server = new McpServer({ name: "geoffrey-spike", version: "0.0.1" });
  server.registerTool(
    "hi",
    {
      title: "Say hi",
      description:
        "Returns a greeting with the name you pass and a live server timestamp. " +
        "Used to prove this server was actually reached.",
      inputSchema: { name: z.string().describe("Any name") },
    },
    async ({ name }) => ({
      content: [{ type: "text", text: `hi ${name}, reached the spike server at ${new Date().toISOString()}` }],
    })
  );
  return server;
}

// createMcpHandler returns { fetch, notify, bus, close }, not a bare function.
const mcp = createMcpHandler(() => buildServer(), { route: "/mcp" });

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/") {
      return new Response(
        `geoffrey-spike is up at ${new Date().toISOString()}\nMCP endpoint: ${url.origin}/mcp\n`,
        { headers: { "Content-Type": "text/plain" } }
      );
    }
    return mcp.fetch(request, env, ctx);
  },
};
```

`wrangler.toml`:

```toml
name = "geoffrey-spike"
main = "src/index.js"
compatibility_date = "2026-09-01"
compatibility_flags = ["nodejs_compat"]
```

Deployed with:

```bash
npx wrangler deploy --temporary
```

### Four findings that change the hosted design

1. **No Durable Object, and no `agents` package.** MCP SDK v2 exports
   `createMcpHandler` from `@modelcontextprotocol/server` directly, and a
   stateless server needs no per-session storage. The spec's §3.1 "one Durable
   Object per owner" is still right, but for *owner state* (tokens, account
   registry, allowlist), not for the MCP session. That is a simpler Worker than
   planned.
2. **`createMcpHandler` returns an object, not a function.** Call
   `mcp.fetch(request, env, ctx)`. Calling the result directly throws
   `TypeError: mcp is not a function`, which is how this spike first failed.
3. **The route is `/mcp`, not `/sse`.** SSE is the older transport. Every
   later spike and the installer's connector URL use `/mcp`.
4. **`wrangler deploy --temporary` needs no Cloudflare account.** It solves a
   proof-of-work challenge and creates a throwaway account, claimable within 60
   minutes. Ideal for a spike. The real deployment needs a real account.

### Verified

Local first (`npx wrangler dev`), then against the public URL:

```bash
U=https://geoffrey-spike.tarry-settee.workers.dev
curl -s $U/
curl -s -X POST $U/mcp -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2026-07-28","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'
curl -s -X POST $U/mcp -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"hi","arguments":{"name":"Jeffrey"}}}'
```

All three returned what they should. The tool call came back with
`hi Jeffrey, reached the spike server at 2026-09-23T03:33:32.775Z`, a live
timestamp from the server rather than an invented answer. Protocol version
negotiated down to `2025-11-25`, which the client and server agreed on.

**Caveat:** the temporary account is unclaimed. If the Worker stops answering,
redeploy with the same command and update the URL in spikes 2, 3, and 4.

> **Result:**
> URL: https://geoffrey-spike.tarry-settee.workers.dev/mcp
> Date run: 2026-09-23
> Outcome: PASS. Reachable from the public internet, full MCP round trip.

---

## Spike 2. Does phone *chat* reach a custom connector?

**Question:** in ordinary Claude chat on the phone, will the model call a tool
on a custom connector?

**Why it matters:** this is the single biggest branch in the build. Phone chat
is the reason the server is hosted at all. If the answer is no, roughly half of
v1 leaves the critical path.

**Do this:**

1. On a computer, go to <https://claude.ai/settings/connectors>.
2. **Add custom connector.** Name it `Spike`. URL: the spike URL from spike 1
   **with `/mcp` on the end**.
3. Save. It should appear in the list as connected.
4. In a chat **on the computer** first, say: *"Use the Spike connector's hi
   tool with the name Jeffrey."* Confirm it works there.
5. Now open the **Claude app on the phone**. New chat. Say the same thing.

**You should see:** on the phone, a tool call to `hi` and a reply containing
`hi Jeffrey, reached the spike server at <timestamp>`. The timestamp proves it
reached the server rather than inventing a plausible answer, check that it is
today's date and close to now.

**Also note:** whether the connector needed re-authorizing on the phone, and
whether it appeared automatically or had to be enabled in the chat's tool
picker. That detail goes into the installer's step 6 instructions.

**What the answer changes:**

- **Yes** → hosting stays in v1, phone chat is a real surface, build order is
  plan 1 → hosted → fork + installer.
- **No** → hosting leaves v1. The phone is served by the Code tab only
  (spike 3), the first user gets Mac + Code tab, and roughly half the build
  disappears. Say so loudly; it is good news for the schedule.

> **Result:**
> Date run:
> Tool called on phone? (yes/no):
> Timestamp returned:
> Re-authorization needed?:
> Outcome:

---

## Spike 3. Can a cloud Code session reach a remote MCP server?

**Question:** a Claude Code session running in Anthropic's cloud (the **Code**
tab on the phone), can it call a remote MCP server?

**Why it matters:** the design says the phone's Code tab gets memory from the
repo and accounts from the connector. Only the memory half has ever been
proven. If a cloud session cannot reach a connector, the Code tab is
memory-only forever.

**Do this:**

1. Push a tiny repo (or use `hammbino/Geoffrey` itself) with a `.mcp.json` at
   its root:

   ```json
   {
     "mcpServers": {
       "spike": {
         "type": "http",
         "url": "https://geoffrey-spike.tarry-settee.workers.dev/mcp"
       }
     }
   }
   ```

2. In the Claude app, open the **Code** tab, start a session against that
   repository.
3. Say: *"List your available MCP tools, then call the hi tool with the name
   Jeffrey."*

**You should see:** `hi` in the tool list, and the greeting with a live
timestamp.

**If the tool is not listed:** ask the session to run `claude mcp list` and
report the output verbatim. That distinguishes "not configured" from
"configured but unreachable". Two very different answers.

**What the answer changes:**

- **Yes** → the Code tab is a full surface: memory *and* accounts.
- **No** → the Code tab is memory-only. Phone chat (spike 2) becomes the only
  full phone surface, which makes hosting *more* important, not less.

> **Result:**
> Date run:
> Tool listed? (yes/no):
> Tool called? (yes/no):
> `claude mcp list` output if it failed:
> Outcome:

---

## Spike 4. Can voice mode drive a connector?

**Question:** in the Claude phone app's voice mode, does asking for a tool
actually call it?

**Why it matters:** "I want to talk to my assistant" is a stated requirement.
Voice is Anthropic's, not ours, so this is a find-out, not a build.

**Do this:**

1. Phone, Claude app, with the Spike connector still connected.
2. Start **voice mode**.
3. Say out loud: *"Use the Spike connector's hi tool with the name Jeffrey."*

**You should see (or hear):** the assistant calling the tool and reading back
the greeting with the timestamp. Note whether the transcript shows a tool call
or whether it only *describes* calling one. A spoken "I'll check that for you"
with no tool call is a failure, not a success.

**What the answer changes:**

- **Yes** → "talk to Geoffrey" works in v1 with no work from us.
- **No** → dictation is what talking to Geoffrey means in v1, and the owner's
  docs say so plainly instead of implying voice works.

> **Result:**
> Date run:
> Tool actually called? (yes/no):
> Outcome:

---

## Spike 5. Do plugin skills load on the phone?

**Question:** does a skill from an installed plugin fire in Claude chat on the
phone?

**Why it matters:** the whole product is 44 skills plus Geoffrey's spine. If
skills do not load on mobile, the phone gets accounts and memory but not the
skills, and that has to be said honestly in the owner's docs rather than
discovered by the first user.

**Do this:**

1. On a computer: Claude app or web → **Customize → Plugins**. Install the
   Geoffrey plugin from `hammbino/Geoffrey` (the repo is public as of
   2026-09-21). If installing from a marketplace URL is not offered, upload the
   `plugin/` directory as a plugin.
2. Confirm on the computer first: in a new chat, say *"What is on my plate?"*
   and check that Geoffrey's behavior appears. It should talk about naming the
   outcome and checking authority, not answer generically.
3. On the **phone**, new chat, same question.

**You should see:** the same Geoffrey-shaped response on the phone. A generic
answer means the skill did not load.

**A cleaner test if the above is ambiguous:** ask *"Which skills do you have
available?"* on both surfaces and compare the lists.

**What the answer changes:**

- **Yes** → the phone is a full Geoffrey.
- **No** → the phone is accounts plus memory; skills run on the Mac and in
  Code-tab sessions. The pitch and the owner's docs both change.

> **Result:**
> Date run:
> Skill fired on computer? (yes/no):
> Skill fired on phone? (yes/no):
> Outcome:

---

## Spike 6. Can a GitHub App commit to one repo with a durable token?

**Question:** can a GitHub App, installed on a single repository, read and
commit there through the API, with a token that does not die when the owner's
browser session does?

**Why it matters:** this is how memory works on every surface that has no local
clone (Desktop, phone chat). It is the most load-bearing assumption in the
spec, and it is independent of the phone, run it whenever.

**Do this:**

1. <https://github.com/settings/apps> → **New GitHub App**.
   - Name: `Geoffrey Memory Spike`
   - Homepage URL: anything (`https://example.com`)
   - Uncheck **Webhook → Active**
   - **Repository permissions → Contents: Read and write**
   - Where can this be installed: **Only on this account**
   - Create.
2. On the app's page: note the **App ID**. Generate a **private key** and save
   the downloaded `.pem`.
3. **Install App** → choose **Only select repositories** → pick one test repo
   (create an empty private one if needed). Note the **installation id** from
   the URL after installing: `.../installations/<id>`.
4. Mint an installation token and commit a file:

   ```bash
   cd ~/geoffrey-spike
   npm install jsonwebtoken
   ```

   Save as `github-spike.mjs`, filling in the four constants:

   ```javascript
   import jwt from "jsonwebtoken";
   import { readFileSync } from "node:fs";

   const APP_ID = "<app id>";
   const INSTALLATION_ID = "<installation id>";
   const PEM_PATH = "<path to the .pem>";
   const REPO = "<owner>/<repo>";

   // A short-lived App JWT, signed with the private key, buys an installation token.
   const appJwt = jwt.sign(
     { iat: Math.floor(Date.now() / 1000) - 60, exp: Math.floor(Date.now() / 1000) + 540, iss: APP_ID },
     readFileSync(PEM_PATH, "utf8"),
     { algorithm: "RS256" }
   );

   const tokenRes = await fetch(
     `https://api.github.com/app/installations/${INSTALLATION_ID}/access_tokens`,
     { method: "POST", headers: { Authorization: `Bearer ${appJwt}`, Accept: "application/vnd.github+json" } }
   );
   const { token, expires_at } = await tokenRes.json();
   console.log("installation token expires at:", expires_at);

   const path = "memory/spike.md";
   const content = Buffer.from(`written by the spike at ${new Date().toISOString()}\n`).toString("base64");

   // If the file already exists its sha is required, so read first and ignore a 404.
   const head = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
     headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
   });
   const sha = head.ok ? (await head.json()).sha : undefined;

   const put = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
     method: "PUT",
     headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
     body: JSON.stringify({ message: "spike: write memory through the API", content, ...(sha ? { sha } : {}) }),
   });
   console.log(put.status, JSON.stringify(await put.json()).slice(0, 200));
   ```

   ```bash
   node github-spike.mjs
   ```

**You should see:** an `expires_at` roughly one hour out, then `201` (or `200`
on a re-run) and a commit visible in the repo. Run it **twice**, the second
run exercises the "file exists, sha required" path, which is what every real
memory write after the first one does.

**Then confirm the scope is real:** change `REPO` to a different repository the
App was *not* installed on and run again. Expect `404`. That proves the grant
is confined to the one repo, which is the security claim in §3.1.

**What the answer changes:**

- **Yes, and confined** → memory-through-the-connector works as specced.
- **Token expires in an hour** → that is expected and fine; the server mints a
  fresh one per call from the private key. Note it so the hosted design stores
  the App private key and installation id, not a token.
- **No** → memory on non-clone surfaces needs a different mechanism, and §6 of
  the spec is reopened before plan 2 is written.

> **Result:**
> Date run:
> `expires_at`:
> First write status:
> Second write status (sha path):
> Wrong-repo status (expect 404):
> Outcome:

---

## After the spikes

Fill in every result box, then the build order follows from the answers:

| Spike 2 (phone chat) | Spike 3 (Code tab) | What v1 becomes |
|---|---|---|
| yes | yes | As specced. Hosted is worth its half. Order: plan 1 → hosted → fork + installer. |
| yes | no | Hosted matters more; Code tab is memory-only. Same order. |
| no | yes | **Hosting leaves v1.** Mac + Code tab, local server, half the build gone. Order: plan 1 → fork + installer. |
| no | no | Phone is memory-only however it is reached. Hosting is deferred; say so in the owner's docs. |

Spike 5 (skills on phone) and spike 4 (voice) change what the docs promise, not
what gets built. Spike 6 gates plan 2 regardless of the phone answers.

**Clean up when done:** `npx wrangler delete` the spike Worker, remove the
Spike connector at claude.ai, uninstall the GitHub App, and delete
`~/geoffrey-spike`. The spike code is throwaway by design. Nothing here moves
into the repo.
