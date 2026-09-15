/**
 * What went wrong upstream, said twice: once for the server log, where naming the provider's
 * own status is the difference between a fixable deploy and a guess, and once for the caller,
 * who gets an action and nothing about our configuration.
 */
export interface ProviderFailure { status: number; code: string; message: string; }

const text = (value: unknown) => typeof value === 'string' ? value : '';

/**
 * Providers quote the credential back at you — "Incorrect API key provided: sk-live-…" — so
 * logging their message verbatim writes the key into the deployment log, where it outlives the
 * request and is readable by anyone with dashboard access.
 */
export function redactSecrets(value: string): string {
  return value
    .replace(/\b(sk|rk|pk|api)[-_][A-Za-z0-9_-]{6,}/gi, '$1-***')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]{8,}=*/gi, 'Bearer ***');
}

export function describeProviderFailure(error: unknown, aborted: boolean, options: { notFoundCode?: string } = {}): ProviderFailure {
  if (aborted) return { status: 504, code: 'TIMEOUT', message: 'That took too long to answer. Try again, or enter it by hand.' };
  const failure = error as { status?: number; code?: string; type?: string; message?: string } | null;
  const status = typeof failure?.status === 'number' ? failure.status : 0;
  const code = `${text(failure?.code)} ${text(failure?.type)} ${text(failure?.message)}`.toLowerCase();

  // A key the provider rejects, or a model this account cannot reach, is a deployment problem.
  // Saying "try again" for either sends people to retry something that will fail identically.
  if (status === 401 || status === 403 || code.includes('invalid_api_key') || code.includes('authentication')) {
    return { status: 503, code: 'NOT_CONFIGURED', message: 'This feature is not configured correctly on the server yet.' };
  }
  if (status === 404 || code.includes('model_not_found') || code.includes('does not exist')) {
    // A 404 means we asked for something that is not there — a model, or an endpoint. Either
    // way it is ours to fix, so the caller is told the same thing and the name says which.
    return { status: 503, code: options.notFoundCode ?? 'MODEL_UNAVAILABLE', message: 'This feature is not configured correctly on the server yet.' };
  }
  if (status === 429 || code.includes('rate_limit') || code.includes('quota')) {
    return { status: 429, code: 'RATE_LIMITED', message: 'Too many requests right now. Try again shortly.' };
  }
  if (status >= 500) return { status: 502, code: 'PROVIDER_DOWN', message: 'The service behind this is down. Try again shortly.' };
  return { status: 502, code: 'PROVIDER_FAILED', message: 'No result is available. Enter this by hand instead.' };
}

/** Server-side only. Carries the provider's status and the model asked for — never the key,
 *  the request body, or anything a caller sent. */
export function logProviderFailure(scope: string, model: string, error: unknown, failure: ProviderFailure) {
  if (process.env.NODE_ENV === 'test') return;
  const detail = error as { status?: number; code?: string; type?: string; message?: string } | null;
  console.error(JSON.stringify({ event: 'provider_failure', scope, model, resolvedAs: failure.code,
    providerStatus: detail?.status ?? null, providerCode: detail?.code ?? detail?.type ?? null,
    providerMessage: redactSecrets(text(detail?.message)).slice(0, 300) || null }));
}
