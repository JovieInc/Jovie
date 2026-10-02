/**
 * Minimal robots.txt allow check for logged-out HTML fetches.
 * Official JSON APIs (YouTube Data API, Wikidata, Wikimedia pageviews,
 * MusicBrainz) are not governed by the HTML site robots file.
 */

interface RobotsRule {
  readonly allow: boolean;
  readonly path: string;
}

interface RobotsGroup {
  readonly agents: readonly string[];
  readonly rules: readonly RobotsRule[];
}

function parseGroups(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let agents: string[] = [];
  let rules: RobotsRule[] = [];
  let seenRule = false;

  const flush = () => {
    if (agents.length > 0) {
      groups.push({ agents, rules });
    }
    agents = [];
    rules = [];
    seenRule = false;
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) {
      if (seenRule) flush();
      continue;
    }
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === 'user-agent') {
      if (seenRule) flush();
      agents.push(value.toLowerCase());
      continue;
    }
    if (key === 'allow' || key === 'disallow') {
      seenRule = true;
      rules.push({ allow: key === 'allow', path: value });
    }
  }
  flush();
  return groups;
}

function ruleRegExp(rulePath: string): RegExp {
  let pattern = '';
  for (let index = 0; index < rulePath.length; index += 1) {
    const char = rulePath[index] ?? '';
    if (char === '*') {
      pattern += '.*';
      continue;
    }
    if (char === '$' && index === rulePath.length - 1) {
      pattern += '$';
      continue;
    }
    pattern += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${pattern}`);
}

function pathMatches(rulePath: string, path: string): boolean {
  if (!rulePath) return false;
  return ruleRegExp(rulePath).test(path);
}

/**
 * True when the path is allowed for this user agent.
 * An empty robots document allows everything. The longest matching rule wins.
 * Equal-length Allow beats Disallow.
 */
export function isPathAllowedByRobots(
  robotsTxt: string,
  userAgent: string,
  path: string
): boolean {
  const groups = parseGroups(robotsTxt);
  if (groups.length === 0) return true;

  const haystack = userAgent.toLowerCase();
  const ranked = groups
    .map(group => {
      let specificLength = 0;
      let wildcard = false;
      for (const agent of group.agents) {
        if (agent === '*') {
          wildcard = true;
          continue;
        }
        if (agent.length > 0 && haystack.includes(agent)) {
          specificLength = Math.max(specificLength, agent.length);
        }
      }
      return { group, specificLength, wildcard };
    })
    .filter(entry => entry.specificLength > 0 || entry.wildcard);

  const specific = ranked.filter(entry => entry.specificLength > 0);
  const longest = specific.reduce(
    (max, entry) => Math.max(max, entry.specificLength),
    0
  );
  const pool =
    longest > 0
      ? specific.filter(entry => entry.specificLength === longest)
      : ranked.filter(entry => entry.wildcard);

  const rules = pool.flatMap(entry => entry.group.rules);
  const normalized = path.startsWith('/') ? path : `/${path}`;
  let winner: { allow: boolean; length: number } | null = null;

  for (const rule of rules) {
    if (!pathMatches(rule.path, normalized)) continue;
    const length = rule.path.length;
    if (
      !winner ||
      length > winner.length ||
      (length === winner.length && rule.allow && !winner.allow)
    ) {
      winner = { allow: rule.allow, length };
    }
  }

  return winner ? winner.allow : true;
}

export type RobotsDecision = 'allowed' | 'disallowed' | 'unavailable';

export interface RobotsTextResult {
  readonly status: number;
  readonly body: string;
}

/**
 * Caches one robots.txt per origin for a single cron run.
 * 404 means the site published no rules (allow). 5xx fails closed.
 */
export class RobotsCache {
  private readonly cache = new Map<string, string | 'error'>();

  constructor(
    private readonly fetchText: (
      url: string
    ) => Promise<RobotsTextResult | null>
  ) {}

  async decide(pageUrl: string, userAgent: string): Promise<RobotsDecision> {
    const url = new URL(pageUrl);
    const origin = url.origin;
    let body = this.cache.get(origin);
    if (body === undefined) {
      const result = await this.fetchText(`${origin}/robots.txt`);
      if (!result || result.status >= 500 || result.status === 429) {
        this.cache.set(origin, 'error');
        return 'unavailable';
      }
      if (result.status === 404) {
        body = '';
      } else if (result.status >= 400) {
        this.cache.set(origin, 'error');
        return 'unavailable';
      } else {
        body = result.body;
      }
      this.cache.set(origin, body);
    }
    if (body === 'error') return 'unavailable';
    return isPathAllowedByRobots(body, userAgent, url.pathname)
      ? 'allowed'
      : 'disallowed';
  }
}
