/**
 * Capture policy for design reference intake (JOV-7081): robots.txt is
 * honoured for our user agent, and hosts whose terms forbid automated
 * collection are refused outright (add a screenshot by file instead).
 */

export const DESIGN_REFS_USER_AGENT = 'JovieDesignRefs';

/** Hosts whose terms prohibit scraping or automated capture. */
export const CAPTURE_BLOCKED_HOSTS: Readonly<Record<string, string>> = {
  'dribbble.com': 'terms prohibit scraping; save the shot and add it by file',
  'behance.net': 'terms prohibit scraping; save the project and add it by file',
  'pinterest.com': 'terms prohibit scraping',
  'instagram.com': 'terms prohibit automated collection',
  'x.com': 'terms prohibit crawling without consent',
  'twitter.com': 'terms prohibit crawling without consent',
  'mobbin.com': 'paid library; terms prohibit redistribution',
};

export function blockedHostReason(url: URL): string | null {
  const host = url.hostname.replace(/^www\./u, '');
  for (const [blocked, reason] of Object.entries(CAPTURE_BLOCKED_HOSTS)) {
    if (host === blocked || host.endsWith(`.${blocked}`)) return reason;
  }
  return null;
}

interface RobotsRule {
  readonly allow: boolean;
  readonly path: string;
}

function ruleMatches(rulePath: string, path: string): boolean {
  const anchored = rulePath.endsWith('$');
  const body = anchored ? rulePath.slice(0, -1) : rulePath;
  const pattern = body
    .split('*')
    .map(part => part.replace(/[.+?^${}()|[\]\\]/gu, '\\$&'))
    .join('.*');
  return new RegExp(`^${pattern}${anchored ? '$' : ''}`, 'u').test(path);
}

/**
 * RFC 9309 evaluation: the most specific matching group (our agent, else
 * `*`), then the longest matching rule; `allow` wins ties.
 */
export function isPathAllowedByRobots(
  robotsTxt: string,
  path: string,
  userAgent: string = DESIGN_REFS_USER_AGENT
): boolean {
  const groups: { agents: string[]; rules: RobotsRule[] }[] = [];
  let current: { agents: string[]; rules: RobotsRule[] } | null = null;
  let lastWasAgent = false;
  for (const rawLine of robotsTxt.split(/\r?\n/u)) {
    const line = rawLine.replace(/#.*$/u, '').trim();
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (field === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current || (field !== 'allow' && field !== 'disallow')) continue;
    if (value === '') continue;
    current.rules.push({ allow: field === 'allow', path: value });
  }
  const agent = userAgent.toLowerCase();
  const own = groups.filter(group => group.agents.includes(agent));
  const applicable =
    own.length > 0 ? own : groups.filter(group => group.agents.includes('*'));
  let best: RobotsRule | null = null;
  for (const rule of applicable.flatMap(group => group.rules)) {
    if (!ruleMatches(rule.path, path)) continue;
    if (
      !best ||
      rule.path.length > best.path.length ||
      (rule.path.length === best.path.length && rule.allow)
    ) {
      best = rule;
    }
  }
  return best ? best.allow : true;
}

export type CapturePermission =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: string };

/** Fetches robots.txt (a missing file allows; an unreachable one refuses). */
export async function checkCapturePermission(
  url: URL,
  fetcher: typeof fetch = fetch
): Promise<CapturePermission> {
  const blocked = blockedHostReason(url);
  if (blocked) return { allowed: false, reason: `${url.hostname}: ${blocked}` };
  let robots = '';
  try {
    const response = await fetcher(new URL('/robots.txt', url.origin), {
      headers: { 'user-agent': DESIGN_REFS_USER_AGENT },
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status >= 500) {
      return {
        allowed: false,
        reason: `${url.origin}/robots.txt returned ${response.status}`,
      };
    }
    if (response.ok) robots = await response.text();
  } catch (error) {
    return {
      allowed: false,
      reason: `${url.origin}/robots.txt unreachable: ${String(error)}`,
    };
  }
  return isPathAllowedByRobots(robots, `${url.pathname}${url.search}`)
    ? { allowed: true }
    : {
        allowed: false,
        reason: `${url.origin}/robots.txt disallows ${url.pathname}`,
      };
}
