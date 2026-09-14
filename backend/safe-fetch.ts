import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/** A URL the caller chose is a request this server makes on their behalf, so it must not be
 *  able to reach anything only this server can reach. */
export class UnsafeUrl extends Error {}

const PRIVATE_V4: [number, number][] = [
  [0x00000000, 8], [0x0a000000, 8], [0x7f000000, 8], [0xa9fe0000, 16], [0xac100000, 12],
  [0xc0a80000, 16], [0x64400000, 10], [0xc0000000, 24], [0xc6120000, 15], [0xe0000000, 4], [0xf0000000, 4],
];
const toLong = (address: string) => address.split('.').reduce((sum, part) => sum * 256 + Number(part), 0);

export function isPrivateAddress(address: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return isPrivateAddress(mapped[1]);
  if (isIP(address) === 4) {
    const value = toLong(address);
    return PRIVATE_V4.some(([base, bits]) => (value >>> (32 - bits)) === (base >>> (32 - bits)));
  }
  const lower = address.toLowerCase();
  // Loopback, unique-local (fc00::/7) and link-local (fe80::/10).
  return lower === '::1' || lower === '::' || /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower);
}

/** Rejects anything that is not a public http(s) host, resolving DNS so a name cannot hide one. */
export async function assertPublicUrl(raw: string, resolver = lookup): Promise<URL> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new UnsafeUrl('Enter a full http:// or https:// address.'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new UnsafeUrl('Only http and https addresses can be imported.');
  if (url.username || url.password) throw new UnsafeUrl('Remove the credentials from that address.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (/^localhost$/i.test(host) || host.endsWith('.localhost') || host.endsWith('.internal')) throw new UnsafeUrl('That address is not reachable from the internet.');
  const addresses = isIP(host) ? [{ address: host }] : await resolver(host, { all: true, verbatim: true }).catch(() => { throw new UnsafeUrl('That address could not be resolved.'); });
  if (!addresses.length) throw new UnsafeUrl('That address could not be resolved.');
  // Every answer has to be public: one private record is enough to make the request unsafe.
  for (const entry of addresses) if (isPrivateAddress(entry.address)) throw new UnsafeUrl('That address is not reachable from the internet.');
  return url;
}

export interface SafeFetchOptions { fetchImpl?: typeof fetch; resolver?: typeof lookup; maxBytes?: number; timeoutMs?: number; maxRedirects?: number }

/** Follows redirects by hand so every hop is re-checked, and stops reading at maxBytes. */
export async function fetchPublicHtml(raw: string, options: SafeFetchOptions = {}): Promise<string> {
  const fetcher = options.fetchImpl ?? fetch;
  const maxBytes = options.maxBytes ?? 2_000_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
  try {
    let target = raw;
    for (let hop = 0; hop <= (options.maxRedirects ?? 3); hop++) {
      const url = await assertPublicUrl(target, options.resolver);
      const response = await fetcher(url.toString(), { redirect: 'manual', signal: controller.signal,
        headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'CalCamp recipe import' } });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) throw new UnsafeUrl('That page redirected nowhere.');
        target = new URL(location, url).toString();
        continue;
      }
      if (!response.ok) throw new UnsafeUrl('That page could not be read.');
      const type = response.headers.get('content-type') ?? '';
      if (type && !/html|xml|text\/plain/i.test(type)) throw new UnsafeUrl('That address is not a web page.');
      const body = await response.text();
      return body.length > maxBytes ? body.slice(0, maxBytes) : body;
    }
    throw new UnsafeUrl('That page redirected too many times.');
  } finally { clearTimeout(timer); }
}
