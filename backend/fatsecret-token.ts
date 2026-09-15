/**
 * FatSecret issues a client-credentials token that lasts a day. Fetching one per search would
 * double every request's latency and burn the token endpoint's own quota, so it is held in
 * memory until shortly before it expires.
 */
export interface TokenManagerOptions {
  credentials?: () => { clientId?: string; clientSecret?: string };
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}
export class TokenUnavailable extends Error {
  constructor(message: string, readonly status?: number, readonly code?: string) { super(message); }
}

const TOKEN_URL = 'https://oauth.fatsecret.com/connect/token';
/** Renew early: a token that expires between the check and the call fails the whole request. */
const SKEW_MS = 60_000;

export function createTokenManager(options: TokenManagerOptions = {}) {
  const fetcher = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const credentials = options.credentials
    ?? (() => ({ clientId: process.env.FATSECRET_CLIENT_ID, clientSecret: process.env.FATSECRET_CLIENT_SECRET }));
  let cached: { token: string; expiresAtMs: number } | null = null;
  let inflight: Promise<string> | null = null;

  async function request(): Promise<string> {
    const { clientId, clientSecret } = credentials();
    if (!clientId || !clientSecret) throw new TokenUnavailable('Branded food search is not configured on this server.', 401);
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const response = await fetcher(TOKEN_URL, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: 'grant_type=client_credentials&scope=basic',
      signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
    });
    const body = await response.json().catch(() => null) as { access_token?: unknown; expires_in?: unknown; error?: unknown; error_description?: unknown } | null;
    if (!response.ok || typeof body?.access_token !== 'string' || !body.access_token) {
      throw new TokenUnavailable(
        typeof body?.error_description === 'string' ? body.error_description : `Token request failed with HTTP ${response.status}`,
        response.status, typeof body?.error === 'string' ? body.error : undefined);
    }
    const seconds = typeof body.expires_in === 'number' && Number.isFinite(body.expires_in) && body.expires_in > 0 ? body.expires_in : 3600;
    cached = { token: body.access_token, expiresAtMs: now() + Math.max(seconds * 1000 - SKEW_MS, 30_000) };
    return cached.token;
  }

  return {
    /** The cached token, or a fresh one. Concurrent callers share a single refresh. */
    async token(): Promise<string> {
      if (cached && now() < cached.expiresAtMs) return cached.token;
      // Without this, ten searches arriving together would each ask for their own token.
      inflight ??= request().finally(() => { inflight = null; });
      return inflight;
    },
    /** Called when FatSecret rejects a token we believed in, so the retry fetches a new one. */
    invalidate() { cached = null; },
  };
}
