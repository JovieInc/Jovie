import 'server-only';

import { lookup } from 'node:dns/promises';
import { isPrivateIpAddress } from '@/lib/ingestion/avatar/network-safety';
import { DEFAULT_USER_AGENT } from '@/lib/ingestion/strategies/base/constants';
import type { LinkHealth } from './link-drift';

/**
 * Polite, public-only link health checks for link-drift proof (JOV-7750).
 *
 * One HEAD per link (GET when HEAD is refused), at most MAX_LINKS links,
 * HEALTH_CONCURRENCY at a time, a short timeout and a few manual redirects.
 * Every hop must resolve to a public address. Only answers that are
 * unambiguous count as broken: 404/410, or a host that does not exist.
 * Bot walls, rate limits, server errors and timeouts stay `unknown`, so a
 * finding never calls a working link dead.
 */

export const MAX_LINKS = 12;
export const HEALTH_CONCURRENCY = 3;
export const HEALTH_TIMEOUT_MS = 5000;
const MAX_HOPS = 4;
const DEAD_STATUSES = new Set([404, 410]);

type HostCheck = 'public' | 'private' | 'missing';

async function checkHost(hostname: string): Promise<HostCheck> {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) return 'private';
  if (isPrivateIpAddress(host)) return 'private';
  try {
    const addresses = await lookup(host, { all: true });
    return addresses.some(address => isPrivateIpAddress(address.address))
      ? 'private'
      : 'public';
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === 'ENOTFOUND' ? 'missing' : 'private';
  }
}

export interface HealthDeps {
  readonly fetchImpl?: typeof fetch;
  readonly hostCheck?: (hostname: string) => Promise<HostCheck>;
}

async function request(
  url: URL,
  method: 'HEAD' | 'GET',
  fetchImpl: typeof fetch
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      method,
      redirect: 'manual',
      signal: controller.signal,
      headers: { 'user-agent': DEFAULT_USER_AGENT },
    });
    // Never read the body: status and headers are all this needs.
    await response.body?.cancel().catch(() => undefined);
    return response;
  } finally {
    clearTimeout(timer);
  }
}

export async function checkLinkHealth(
  rawUrl: string,
  deps: HealthDeps = {}
): Promise<LinkHealth> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const hostCheck = deps.hostCheck ?? checkHost;
  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    return { url: rawUrl, status: 'unknown' };
  }
  const original = current;
  try {
    for (let hop = 0; hop < MAX_HOPS; hop++) {
      if (current.protocol !== 'https:' && current.protocol !== 'http:') {
        return { url: rawUrl, status: 'unknown' };
      }
      const host = await hostCheck(current.hostname);
      if (host === 'missing') return { url: rawUrl, status: 'dead' };
      if (host === 'private') return { url: rawUrl, status: 'unknown' };

      let response = await request(current, 'HEAD', fetchImpl);
      if (response.status === 405 || response.status === 501) {
        response = await request(current, 'GET', fetchImpl);
      }
      const location = response.headers.get('location');
      if (response.status >= 300 && response.status < 400 && location) {
        current = new URL(location, current);
        continue;
      }
      if (DEAD_STATUSES.has(response.status)) {
        return { url: rawUrl, status: 'dead', httpStatus: response.status };
      }
      if (response.status >= 200 && response.status < 300) {
        const landedOnHomepage =
          current.hostname !== original.hostname &&
          (current.pathname === '/' || current.pathname === '') &&
          original.pathname !== '/' &&
          original.pathname !== '';
        return {
          url: rawUrl,
          status: landedOnHomepage ? 'homepage-redirect' : 'ok',
          httpStatus: response.status,
          finalUrl: current.toString(),
        };
      }
      return { url: rawUrl, status: 'unknown', httpStatus: response.status };
    }
    return { url: rawUrl, status: 'unknown' };
  } catch {
    return { url: rawUrl, status: 'unknown' };
  }
}

/** Checks up to MAX_LINKS links, HEALTH_CONCURRENCY at a time, in order. */
export async function checkLinksHealth(
  urls: readonly string[],
  deps: HealthDeps = {}
): Promise<readonly LinkHealth[]> {
  const queue = [...new Set(urls)].slice(0, MAX_LINKS);
  const results: LinkHealth[] = new Array(queue.length);
  let next = 0;
  await Promise.all(
    Array.from(
      { length: Math.min(HEALTH_CONCURRENCY, queue.length) },
      async () => {
        while (next < queue.length) {
          const index = next++;
          results[index] = await checkLinkHealth(queue[index] as string, deps);
        }
      }
    )
  );
  return results;
}
