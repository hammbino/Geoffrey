import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["/Users/jeffrey/Sandbox/Geoffrey/mcp/src/index.js"],
});
const client = new Client({ name: "two-account", version: "1.0.0" });
await client.connect(transport);

const accts = JSON.parse((await client.callTool({ name: "list_accounts", arguments: {} })).content[0].text);
console.log("CONNECTED MAILBOXES:");
for (const a of accts.accounts) console.log(`  ${a.id.padEnd(10)} ${a.email}  — ${a.purpose}`);
console.log();

for (const a of accts.accounts) {
  const r = await client.callTool({
    name: "search_messages",
    arguments: { account: a.id, query: "newer_than:3d", limit: 3 },
  });
  const p = JSON.parse(r.content[0].text);
  console.log(`--- ${a.id} (${p.email}): ${p.count} recent`);
  for (const m of p.messages) {
    console.log(`    ${(m.subject || "(no subject)").slice(0, 62)}`);
    console.log(`      from ${(m.from || "?").slice(0, 50)}${m.unread ? "  [unread]" : ""}`);
  }
  console.log();
}
await client.close();
