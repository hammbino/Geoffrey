# Connecting Outlook / Microsoft 365

One app registration, then one sign-in per mailbox. The registration is done
**once** no matter how many Outlook accounts you connect — roughly ten minutes.

Microsoft moves this portal around. Where a label has shifted, the checkpoint
after each phase tells you the end state to confirm, which matters more than the
exact click path.

---

## Before you start

Sign in with **any** Microsoft account you control. It does not have to be the
mailbox you want to connect — the app registration is just an identity for
Geoffrey. Because we register it as multi-tenant plus personal accounts, any
Microsoft account can later sign in through it, including personal
`outlook.com` addresses.

---

## Phase 1 — Create the registration

1. Open <https://entra.microsoft.com> and sign in.
2. In the left sidebar: **Applications → App registrations**.
3. Click **+ New registration** at the top.
4. Fill the form:

   | Field | Value |
   |---|---|
   | **Name** | `Geoffrey` |
   | **Supported account types** | *Accounts in any organizational directory (Any Microsoft Entra ID tenant - Multitenant) **and** personal Microsoft accounts (e.g. Skype, Xbox)* |

   Picking the multitenant + personal option is what lets both work and
   personal Outlook addresses connect. The single-tenant option would limit
   Geoffrey to one organization.

5. Under **Redirect URI**, set the dropdown to **Public client/native (mobile &
   desktop)** — *not* Web — and type exactly:

   ```
   http://localhost:8731
   ```

   > Entra matches redirect URIs character for character and does no loopback
   > wildcards. `127.0.0.1` will not work here, nor will a trailing slash or a
   > different port. This is the most common cause of `AADSTS50011`.

6. Click **Register**.

**✅ Checkpoint:** you land on the app's **Overview** page showing *Geoffrey*.

---

## Phase 2 — Copy the client ID

On the **Overview** page find **Application (client) ID** — a GUID like
`4a1b2c3d-1111-2222-3333-abcdefabcdef`. Click the copy icon.

That value is what you pass as `--client-id`. It is not a secret; Geoffrey uses
PKCE instead of a client secret, so there is no secret to create or protect.

**✅ Checkpoint:** you have a GUID on your clipboard. Paste it somewhere for a
moment — you need it at the end.

---

## Phase 3 — Allow public client flows

This is the step that is easy to miss and produces a confusing failure later.

1. Left sidebar of the app: **Manage → Authentication**.
2. Scroll to **Advanced settings**.
3. Find **Allow public client flows** and set it to **Yes**.
4. Click **Save** at the top.

Geoffrey is a desktop app using PKCE with no client secret. Left as No, Entra
treats it as a confidential client and the token exchange fails complaining
about a missing secret — an error that points nowhere near this toggle.

**✅ Checkpoint:** *Allow public client flows* reads **Yes** after the page
reloads.

---

## Phase 4 — Add permissions

1. Left sidebar: **Manage → API permissions**.
2. Click **+ Add a permission**.
3. Choose **Microsoft Graph**.
4. Choose **Delegated permissions** (not Application permissions — delegated
   means Geoffrey acts as you, with exactly your access and nothing more).
5. Search for and tick each of these:

   | Permission | Why |
   |---|---|
   | `Mail.ReadWrite` | Read mail and create drafts |
   | `Calendars.Read` | Read calendar events |
   | `User.Read` | Identify which mailbox just connected |
   | `offline_access` | Stay connected without re-signing in |

6. Click **Add permissions**.

**Not** `Mail.Send`. Geoffrey has no send tool — drafts are written for you to
review and send yourself. Granting send would create an ability nothing uses and
a risk nothing needs.

Optional: `MailboxSettings.Read` adds Outlook **categories** to `list_labels`.
Skipped by default because it is a broader grant than a convenience feature
deserves — without it, `list_labels` returns folders and says so.

**✅ Checkpoint:** the permissions table lists all four with type **Delegated**.

A personal Microsoft account consents at sign-in and needs nothing more. A work
account in a tenant that restricts user consent will show *"needs admin
approval"* — an admin clicks **Grant admin consent for \<org\>** once, and every
user in that tenant is covered.

---

## Phase 5 — Connect a mailbox

```bash
cd /Users/jeffrey/Repos/Geoffrey/geoffrey-mcp
npm run add-account -- \
  --provider microsoft \
  --client-id PASTE-THE-GUID-HERE \
  --id outlook \
  --purpose "work Outlook"
```

Your browser opens to Microsoft. **Sign in with the mailbox you want to
connect** — this is where the actual account is chosen, not during registration.
Review the permission list and accept.

Expected output:

```
Using Microsoft public client 4a1b2c3d-...
Connected "outlook" → you@yourcompany.com (Your Name)
Saved to /Users/jeffrey/.geoffrey/accounts.json
```

The script calls Graph before saving, so a token that cannot actually read mail
fails here loudly instead of days later.

### More mailboxes

Same command, new `--id`. The client ID is reused every time — one registration
covers all of them:

```bash
npm run add-account -- --provider microsoft --client-id <same-guid> --id outlook-old --purpose "legacy inbox"
```

---

## Confirm it worked

```bash
cd /Users/jeffrey/Repos/Geoffrey/geoffrey-mcp
node two-account-test.mjs
```

Every connected mailbox should list, Gmail and Outlook alike, and each should
return recent messages.

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `AADSTS50011` redirect mismatch | Redirect is not exactly `http://localhost:8731`, or was added under the **Web** platform instead of **Public client/native**. Authentication → check the platform section. |
| Error mentioning a client secret, or "confidential client" | Phase 3 — *Allow public client flows* is still **No**. |
| `AADSTS65001` / consent required | Work tenant restricts user consent. An admin grants consent once in API permissions. |
| Connects, but Graph returns 403 later | A permission from Phase 4 is missing. Add it, then reconnect the account. |
| `invalid_scope` | A permission was added as **Application** rather than **Delegated**. Remove and re-add as delegated. |
| Browser opens to an account you did not want | Sign out of Microsoft in that browser, or use a private window, then re-run. |

---

## How Outlook behaves differently from Gmail

Same tool names, because Graph has no "labels" concept and the provider maps
onto Outlook's model:

| Call | Outlook behaviour |
|---|---|
| `remove: ["UNREAD"]` | Marks read |
| `add: ["UNREAD"]` | Marks unread |
| `remove: ["INBOX"]` | Moves to Archive |
| any other id | Outlook **category** |

`list_labels` returns folders and categories together, each tagged with its
type, so a location is distinguishable from a tag.
