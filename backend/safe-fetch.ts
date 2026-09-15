import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Agent, fetch as undiciFetch } from 'undici';

/** A URL the caller chose is a request this server makes on their behalf, so it must not be
 *  able to reach anything only this server can reach. */
export class UnsafeUrl extends Error {}

/** IPv4 ranges that are not reachable from the internet, as [network, prefix length]. */
const PRIVATE_V4: [number, number][] = [
  [0x00000000, 8], [0x0a000000, 8], [0x7f000000, 8], [0xa9fe0000, 16], [0xac100000, 12],
  [0xc0a80000, 16], [0x64400000, 10], [0xc0000000, 24], [0xc6120000, 15], [0xe0000000, 4], [0xf0000000, 4],
];
const privateV4 = (a: number, b: number, c: number, d: number) => {
  const value = ((a << 24) >>> 0) + (b << 16) + (c << 8) + d;
  return PRIVATE_V4.some(([base, bits]) => (value >>> (32 - bits)) === (base >>> (32 - bits)));
};

/**
 * The sixteen bytes of an IPv6 address, whatever spelling it arrived in. Comparing the text
 * instead is how `::ffff:7f00:1` slipped through while `::ffff:127.0.0.1` was caught: they are
 * the same address written two ways, and only the bytes say so.
 */
export function ipv6Bytes(input: string): Uint8Array | null {
  const address = input.split('%')[0];
  if (isIP(address) !== 6) return null;
  const halves = address.split('::');
  if (halves.length > 2) return null;
  const groupsOf = (part: string): number[] | null => {
    if (!part) return [];
    const out: number[] = [];
    for (const piece of part.split(':')) {
      if (piece.includes('.')) {
        if (isIP(piece) !== 4) return null;
        const [a, b, c, d] = piece.split('.').map(Number);
        out.push((a << 8) | b, (c << 8) | d);
      } else {
        if (!/^[0-9a-f]{1,4}$/i.test(piece)) return null;
        out.push(parseInt(piece, 16));
      }
    }
    return out;
  };
  const head = groupsOf(halves[0] ?? '');
  const tail = halves.length === 2 ? groupsOf(halves[1] ?? '') : [];
  if (!head || !tail) return null;
  const groups = halves.length === 2
    ? [...head, ...Array<number>(8 - head.length - tail.length).fill(0), ...tail]
    : head;
  if (groups.length !== 8 || groups.some(group => group < 0 || group > 0xffff)) return null;
  const bytes = new Uint8Array(16);
  groups.forEach((group, index) => { bytes[index * 2] = group >> 8; bytes[index * 2 + 1] = group & 0xff; });
  return bytes;
}

export function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) { const [a, b, c, d] = address.split('.').map(Number); return privateV4(a, b, c, d); }
  const bytes = ipv6Bytes(address);
  if (!bytes) return true; // Unparseable is not proven public, and proof is what this needs.
  const topTenZero = bytes.subarray(0, 10).every(byte => byte === 0);
  // ::ffff:a.b.c.d is an IPv4 address wearing IPv6 syntax, in any spelling; so is ::a.b.c.d.
  if (topTenZero && bytes[10] === 0xff && bytes[11] === 0xff) return privateV4(bytes[12], bytes[13], bytes[14], bytes[15]);
  // ::, ::1 and the deprecated IPv4-compatible block are never a public destination.
  if (topTenZero && bytes[10] === 0 && bytes[11] === 0) return true;
  // The NAT64 well-known prefix carries an embedded IPv4 destination.
  if (bytes[0] === 0x00 && bytes[1] === 0x64 && bytes[2] === 0xff && bytes[3] === 0x9b) return true;
  if ((bytes[0] & 0xfe) === 0xfc) return true;                 // fc00::/7 unique local
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) return true; // fe80::/10 link local
  if (bytes[0] === 0xff) return true;                          // multicast
  return false;
}

export interface VerifiedUrl { url: URL; addresses: { address: string; family: number }[] }

/** Rejects anything that is not a public http(s) host, resolving DNS so a name cannot hide one. */
export async function assertPublicUrl(raw: string, resolver = lookup): Promise<VerifiedUrl> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new UnsafeUrl('Enter a full http:// or https:// address.'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new UnsafeUrl('Only http and https addresses can be imported.');
  if (url.username || url.password) throw new UnsafeUrl('Remove the credentials from that address.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (/^localhost$/i.test(host) || host.endsWith('.localhost') || host.endsWith('.internal')) throw new UnsafeUrl('That address is not reachable from the internet.');
  const resolved = isIP(host)
    ? [{ address: host, family: isIP(host) }]
    : await resolver(host, { all: true, verbatim: true }).catch(() => { throw new UnsafeUrl('That address could not be resolved.'); });
  if (!resolved.length) throw new UnsafeUrl('That address could not be resolved.');
  // Every answer has to be public: one private record is enough to make the request unsafe.
  for (const entry of resolved) if (isPrivateAddress(entry.address)) throw new UnsafeUrl('That address is not reachable from the internet.');
  return { url, addresses: resolved.map(entry => ({ address: entry.address, family: entry.family })) };
}

/**
 * A dispatcher that connects only to the addresses already checked, instead of resolving the
 * name a second time. Without it the guard and the socket ask DNS separately, and a record with
 * a one-second lifetime can answer publicly for the check and privately for the connection.
 * The hostname still drives SNI and certificate validation, so pinning costs nothing there.
 */
function pinnedAgent(addresses: { address: string; family: number }[]) {
  return new Agent({ connect: { lookup: (_hostname, options, callback) => {
    const [first] = addresses;
    if (options?.all) (callback as unknown as (e: null, a: typeof addresses) => void)(null, addresses);
    else callback(null, first.address, first.family);
  } } });
}

export interface SafeFetchOptions { fetchImpl?: typeof fetch; resolver?: typeof lookup; maxBytes?: number; timeoutMs?: number; maxRedirects?: number }

/** Reads the body a chunk at a time and stops at maxBytes, rather than buffering whatever the
 *  far end decides to send and trimming afterwards. */
async function readBounded(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<string> {
  if (!body) return '';
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      received += value.byteLength;
      chunks.push(value);
      if (received >= maxBytes) break;
    }
  } finally { await reader.cancel().catch(() => {}); }
  const joined = new Uint8Array(Math.min(received, maxBytes));
  let offset = 0;
  for (const chunk of chunks) {
    if (offset >= joined.length) break;
    const slice = chunk.subarray(0, joined.length - offset);
    joined.set(slice, offset); offset += slice.length;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(joined);
}

/** Follows redirects by hand so every hop is re-checked, and stops reading at maxBytes. */
export async function fetchPublicHtml(raw: string, options: SafeFetchOptions = {}): Promise<string> {
  const maxBytes = options.maxBytes ?? 2_000_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
  const agents: Agent[] = [];
  try {
    let target = raw;
    for (let hop = 0; hop <= (options.maxRedirects ?? 3); hop++) {
      const { url, addresses } = await assertPublicUrl(target, options.resolver);
      const init = { redirect: 'manual' as const, signal: controller.signal,
        headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'CalCamp recipe import' } };
      let response: { status: number; ok: boolean; headers: { get(name: string): string | null }; body: ReadableStream<Uint8Array> | null };
      if (options.fetchImpl) response = await options.fetchImpl(url.toString(), init) as unknown as typeof response;
      else {
        const agent = pinnedAgent(addresses); agents.push(agent);
        response = await undiciFetch(url.toString(), { ...init, dispatcher: agent }) as unknown as typeof response;
      }
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) throw new UnsafeUrl('That page redirected nowhere.');
        target = new URL(location, url).toString();
        continue;
      }
      if (!response.ok) throw new UnsafeUrl('That page could not be read.');
      const type = response.headers.get('content-type') ?? '';
      if (type && !/html|xml|text\/plain/i.test(type)) throw new UnsafeUrl('That address is not a web page.');
      const declared = Number(response.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > maxBytes * 4) throw new UnsafeUrl('That page is too large to read.');
      return await readBounded(response.body, maxBytes);
    }
    throw new UnsafeUrl('That page redirected too many times.');
  } finally {
    clearTimeout(timer);
    for (const agent of agents) void agent.close().catch(() => {});
  }
}
