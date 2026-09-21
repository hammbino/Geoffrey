#!/usr/bin/env node
// Geoffrey MCP server — multi-account mail for any MCP client.
//
// Claude's built-in connectors hold one account each. This server fronts any
// number of mailboxes behind a single connector, because the account is a tool
// argument rather than a property of the connection.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { listAccounts, getAccount } from "./store.js";
import * as google from "./providers/google.js";
import * as microsoft from "./providers/microsoft.js";

const providers = { google, microsoft };

function providerFor(account) {
  const p = providers[account.provider];
  if (!p) throw new Error(`No provider implemented for "${account.provider}"`);
  return p;
}

const ok = (data) => ({
  content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
});
const fail = (err) => ({
  content: [{ type: "text", text: `Error: ${err.message}` }],
  isError: true,
});

const server = new McpServer(
  { name: "geoffrey", version: "0.1.0" },
  {
    instructions:
      "Geoffrey provides access to several email accounts at once. Every tool " +
      "requires an explicit `account` id — never assume which mailbox the user " +
      "means. Call list_accounts first to see what is connected, and say which " +
      "account each result came from when reporting back.",
  }
);

server.registerTool(
  "list_accounts",
  {
    title: "List connected accounts",
    description:
      "List every connected mailbox with its id, provider, email address, and " +
      "what it is used for. Call this before any other tool so you know which " +
      "account ids are valid.",
    inputSchema: {},
  },
  async () => {
    try {
      const accounts = listAccounts();
      if (accounts.length === 0) {
        return ok({
          accounts: [],
          hint: "No accounts connected yet. Run: npm run add-account",
        });
      }
      return ok({ accounts });
    } catch (err) {
      return fail(err);
    }
  }
);

server.registerTool(
  "search_messages",
  {
    title: "Search one mailbox",
    description:
      "Search a single mailbox and return message summaries — id, sender, " +
      "subject, date, snippet. Does NOT return message bodies; use get_message " +
      "for that. To search several mailboxes, call this once per account. " +
      "Use the structured filters rather than raw query syntax where possible; " +
      "they behave the same on Gmail and Outlook.",
    inputSchema: {
      account: z.string().describe("Account id from list_accounts. Required."),
      unread_only: z.boolean().optional().describe("Only unread messages"),
      newer_than_days: z.number().int().min(1).optional()
        .describe("Only messages received within this many days"),
      from_address: z.string().optional().describe("Only messages from this address"),
      query: z.string().optional().describe(
        "Free-text search. Prefer the structured filters above — they work " +
        "identically on Gmail and Outlook, whereas raw query syntax differs " +
        "between providers. On Outlook a free-text query cannot be combined " +
        "with the structured filters."
      ),
      limit: z.number().int().min(1).max(25).default(10)
        .describe("Max results (1-25). Keep small; summaries cost context."),
    },
  },
  async ({ account, query, unread_only, newer_than_days, from_address, limit }) => {
    try {
      const acct = getAccount(account);
      return ok(await providerFor(acct).searchMessages(acct, {
        query, unread_only, newer_than_days, from_address, limit,
      }));
    } catch (err) {
      return fail(err);
    }
  }
);

server.registerTool(
  "get_message",
  {
    title: "Read one message",
    description:
      "Fetch the full text of one message by id, including its body. Use only " +
      "after search_messages has identified a specific message worth reading.",
    inputSchema: {
      account: z.string().describe("Account id the message belongs to. Required."),
      id: z.string().describe("Message id from search_messages."),
    },
  },
  async ({ account, id }) => {
    try {
      const acct = getAccount(account);
      return ok(await providerFor(acct).getMessage(acct, { id }));
    } catch (err) {
      return fail(err);
    }
  }
);

server.registerTool(
  "list_labels",
  {
    title: "List labels in a mailbox",
    description:
      "List the labels/folders in one mailbox, with their ids. Call this before " +
      "modify_labels so you use real label ids rather than guessing names.",
    inputSchema: {
      account: z.string().describe("Account id from list_accounts. Required."),
    },
  },
  async ({ account }) => {
    try {
      const acct = getAccount(account);
      return ok(await providerFor(acct).listLabels(acct));
    } catch (err) {
      return fail(err);
    }
  }
);

server.registerTool(
  "modify_labels",
  {
    title: "Label, archive, or mark read",
    description:
      "Add or remove labels on one message. This is also how you archive and " +
      "mark as read: archiving is removing INBOX, marking read is removing " +
      "UNREAD. Use list_labels first to get valid label ids.",
    inputSchema: {
      account: z.string().describe("Account id the message belongs to. Required."),
      message_id: z.string().describe("Message id from search_messages."),
      add: z.array(z.string()).default([]).describe('Label ids to add, e.g. ["STARRED"]'),
      remove: z.array(z.string()).default([])
        .describe('Label ids to remove, e.g. ["INBOX"] to archive, ["UNREAD"] to mark read'),
    },
  },
  async ({ account, message_id, add, remove }) => {
    try {
      const acct = getAccount(account);
      return ok(await providerFor(acct).modifyLabels(acct, { message_id, add, remove }));
    } catch (err) {
      return fail(err);
    }
  }
);

server.registerTool(
  "create_draft",
  {
    title: "Draft a reply or new message",
    description:
      "Save a draft in the mailbox. The draft is NOT sent — there is no send " +
      "tool, by design. The human reviews and sends it. Pass " +
      "reply_to_message_id to thread the draft onto an existing conversation.",
    inputSchema: {
      account: z.string().describe("Account id to draft from. Required — this decides which address it appears to come from."),
      to: z.string().describe("Recipient address"),
      subject: z.string().describe("Subject line"),
      body: z.string().describe("Plain text body"),
      reply_to_message_id: z.string().optional()
        .describe("Message id being replied to; threads the draft correctly"),
    },
  },
  async ({ account, to, subject, body, reply_to_message_id }) => {
    try {
      const acct = getAccount(account);
      return ok(await providerFor(acct).createDraft(acct, { to, subject, body, reply_to_message_id }));
    } catch (err) {
      return fail(err);
    }
  }
);

server.registerTool(
  "list_calendars",
  {
    title: "List calendars in an account",
    description:
      "List the calendars visible to one account, with their ids. Call before " +
      "list_events if you need a calendar other than the primary one.",
    inputSchema: {
      account: z.string().describe("Account id from list_accounts. Required."),
    },
  },
  async ({ account }) => {
    try {
      const acct = getAccount(account);
      return ok(await providerFor(acct).listCalendars(acct));
    } catch (err) {
      return fail(err);
    }
  }
);

server.registerTool(
  "list_events",
  {
    title: "List calendar events",
    description:
      "List upcoming events on one calendar, earliest first. Read-only — " +
      "Geoffrey cannot create or change events, because inviting attendees " +
      "sends real invitations. To see a whole week across several accounts, " +
      "call this once per account.",
    inputSchema: {
      account: z.string().describe("Account id from list_accounts. Required."),
      calendar_id: z.string().default("primary")
        .describe('Calendar id from list_calendars, or "primary"'),
      time_min: z.string().optional()
        .describe("ISO 8601 start of window. Defaults to now."),
      time_max: z.string().optional()
        .describe("ISO 8601 end of window."),
      limit: z.number().int().min(1).max(25).default(10),
    },
  },
  async ({ account, calendar_id, time_min, time_max, limit }) => {
    try {
      const acct = getAccount(account);
      return ok(await providerFor(acct).listEvents(acct, { calendar_id, time_min, time_max, limit }));
    } catch (err) {
      return fail(err);
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
