import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["/Users/jeffrey/Sandbox/Geoffrey/mcp/src/index.js"],
});
const client = new Client({ name: "smoke", version: "1.0.0" });
await client.connect(transport);

const { tools } = await client.listTools();
console.log("TOOLS:", tools.map(t => t.name).join(", "));
console.log();

console.log("--- list_accounts");
let r = await client.callTool({ name: "list_accounts", arguments: {} });
console.log(r.content[0].text);
console.log();

console.log("--- search_messages (account omitted -> should error)");
r = await client.callTool({ name: "search_messages", arguments: { query: "test" } });
console.log("isError:", r.isError, "|", r.content[0].text.slice(0, 160));
console.log();

console.log("--- search_messages (bad account -> should name valid ids)");
r = await client.callTool({ name: "search_messages", arguments: { account: "nope", query: "test" } });
console.log("isError:", r.isError, "|", r.content[0].text.slice(0, 160));
console.log();

console.log("--- search_messages (real)");
r = await client.callTool({ name: "search_messages", arguments: { account: "personal", query: "newer_than:7d", limit: 3 } });
const parsed = JSON.parse(r.content[0].text);
console.log("account:", parsed.account, "| count:", parsed.count);
for (const m of parsed.messages) console.log(`  [${m.id}] ${m.subject?.slice(0,60)} — ${m.from?.slice(0,40)}`);
console.log();

if (parsed.messages[0]) {
  console.log("--- get_message (first result)");
  const g = await client.callTool({ name: "get_message", arguments: { account: "personal", id: parsed.messages[0].id } });
  const msg = JSON.parse(g.content[0].text);
  console.log("subject:", msg.subject);
  console.log("body chars:", (msg.body||"").length);
}

await client.close();
