// Account registry.
//
// Lives outside the repo at ~/.geoffrey/accounts.json so credentials can never
// be committed by accident. One file, chmod 600, plain JSON — readable and
// portable by design (see architecture rule 4).

import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DIR = join(homedir(), ".geoffrey");
const FILE = join(DIR, "accounts.json");

export function storePath() {
  return FILE;
}

export function load() {
  if (!existsSync(FILE)) return { accounts: [] };
  return JSON.parse(readFileSync(FILE, "utf8"));
}

export function save(data) {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(data, null, 2));
  chmodSync(FILE, 0o600);
}

export function listAccounts() {
  return load().accounts.map(({ id, provider, email, purpose, added_at }) => ({
    id, provider, email, purpose, added_at,
  }));
}

// Throws rather than defaulting. Rule 3: omitting the account is an error,
// never a guess about which mailbox the user meant.
export function getAccount(id) {
  if (!id) {
    throw new Error(
      "No account specified. Every tool needs an explicit account id. " +
      "Call list_accounts to see what is connected."
    );
  }
  const found = load().accounts.find((a) => a.id === id);
  if (!found) {
    const known = load().accounts.map((a) => a.id).join(", ") || "none";
    throw new Error(`Unknown account "${id}". Connected accounts: ${known}`);
  }
  return found;
}

export function upsertAccount(account) {
  const data = load();
  const i = data.accounts.findIndex((a) => a.id === account.id);
  if (i >= 0) data.accounts[i] = { ...data.accounts[i], ...account };
  else data.accounts.push(account);
  save(data);
  return account;
}
