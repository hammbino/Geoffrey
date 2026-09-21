// Access-token minting.
//
// Refresh tokens live in the account store; access tokens are short-lived and
// kept only in memory, cached until just before expiry.

const cache = new Map(); // accountId -> { token, expiresAt }

const TOKEN_URI = {
  google: "https://oauth2.googleapis.com/token",
  microsoft: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
};

export async function accessToken(account) {
  const hit = cache.get(account.id);
  if (hit && hit.expiresAt > Date.now() + 60_000) return hit.token;

  const uri = TOKEN_URI[account.provider];
  if (!uri) throw new Error(`Unsupported provider: ${account.provider}`);

  const res = await fetch(uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: account.client_id,
      // Microsoft desktop registrations are public clients: PKCE, no secret.
      ...(account.client_secret ? { client_secret: account.client_secret } : {}),
      refresh_token: account.refresh_token,
      grant_type: "refresh_token",
      ...(account.provider === "microsoft"
        ? { scope: account.scope ?? "Mail.ReadWrite Calendars.Read offline_access" }
        : {}),
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(
      `Could not refresh access for "${account.id}" (${res.status}). ` +
      `Re-run: npm run add-account -- --id ${account.id}\n${detail}`
    );
  }

  const json = await res.json();
  cache.set(account.id, {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  });
  return json.access_token;
}
