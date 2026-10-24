/**
 * External API guard: every outbound third-party call goes through the client
 * layer (packages/api-client for TS/JS, scripts/apiclient for Python, and
 * `node packages/api-client/cli.ts gh` for shell). Direct provider hosts, SDK
 * clients and raw `gh` calls elsewhere fail CI.
 *
 * Existing call sites are grandfathered per (file, rule) count in
 * external-api-guard.ratchet.gen.json. The ratchet only shrinks: a count that
 * grows fails, a count that drops must be lowered (`--write`), and no entry
 * may exceed its value on the base revision. Call sites already on the base
 * revision (main at merge-group time) never fail a PR: only the PR's own new
 * calls do, so a call that lands on main first cannot eject an unrelated PR.
 * Justified permanent exceptions
 * live in external-api-guard.allowlist.json with a reason and a cap.
 * Rule contract: .claude/rules/external-apis.md.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const RATCHET_PATH = 'scripts/lib/external-api-guard.ratchet.gen.json';
export const ALLOWLIST_PATH = 'scripts/lib/external-api-guard.allowlist.json';
export const RATCHET_SCHEMA = 'jovie-external-api-ratchet/v1';
const PROVIDERS_PATH = 'packages/api-client/providers.json';

/** The client layer itself may talk to providers. */
export const CLIENT_LAYER = [
  /^packages\/api-client\//,
  /^scripts\/apiclient\//,
];

const CODE = /\.(?:ts|tsx|js|mjs|cjs|mts|cts)$/;
const PY = /\.py$/;
const SHELL = /\.(?:sh|bash)$/;
const YAML = /\.ya?ml$/;
const SCANNED = /\.(?:ts|tsx|js|mjs|cjs|mts|cts|py|sh|bash|ya?ml)$/;
const NOT_SOURCE =
  /(?:\.test\.|\.spec\.|\.stories\.|\.gen\.|\.d\.ts$|(?:^|\/)(?:__tests__|__mocks__|tests?|fixtures|node_modules|dist|build)\/)/;

const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Host (+ path prefix) entries from the shared contract, regex-escaped. */
export function providerHosts(providers) {
  const hosts = [];
  for (const spec of Object.values(providers.providers)) {
    for (const host of spec.hosts)
      hosts.push(
        escape(host) + (spec.pathPrefix ? escape(spec.pathPrefix) : '')
      );
  }
  return hosts;
}

/** Provider hosts from the shared contract (sentry only for its /api/ path). */
export function providerHostPattern(
  providers,
  hosts = providerHosts(providers)
) {
  return new RegExp(`(?:https?://|['"\`])(?:${hosts.join('|')})`, 'g');
}

/**
 * Registering a provider in providers.json is the one reviewed way to grow
 * the ratchet: existing calls to a host the base contract did not list may
 * be grandfathered (`--onboard`). Returns per-file hit counts for those hosts.
 */
export function onboardedHits(found, baseProviders, providers, read) {
  if (!baseProviders) return {};
  const known = new Set(providerHosts(baseProviders));
  const added = providerHosts(providers).filter(host => !known.has(host));
  if (added.length === 0) return {};
  const pattern = providerHostPattern(providers, added);
  const hits = {};
  for (const path of Object.keys(found)) {
    if (!found[path]['provider-host']) continue;
    const count = [...read(path).matchAll(pattern)].length;
    if (count > 0) hits[path] = count;
  }
  return hits;
}

const GH_SUBCOMMANDS =
  'api|pr|issue|run|search|release|workflow|repo|label|secret|variable|cache|project';

export function buildRules(providers) {
  return [
    {
      id: 'provider-host',
      applies: path =>
        CODE.test(path) || PY.test(path) || SHELL.test(path) || YAML.test(path),
      pattern: providerHostPattern(providers),
      fix: 'call the provider through packages/api-client (TS) or scripts/apiclient (Python)',
    },
    {
      id: 'provider-sdk',
      applies: path => CODE.test(path),
      pattern:
        /\bnew (?:Octokit|LinearClient|Anthropic|OpenAI)\s*\(|(?:from\s+|require\(\s*|import\(\s*)['"](?:@octokit\/[\w-]+|octokit|@linear\/sdk|@anthropic-ai\/sdk|openai|@vercel\/sdk|@ai-sdk\/gateway)['"]/g,
      fix: 'use the provider adapter in packages/api-client instead of a second SDK client',
    },
    {
      id: 'provider-sdk',
      applies: path => PY.test(path),
      pattern:
        /^\s*(?:import|from)\s+(?:anthropic|openai|github|linear_sdk)\b/gm,
      fix: 'use scripts/apiclient instead of a provider SDK',
    },
    {
      id: 'gh-subprocess',
      applies: path => PY.test(path),
      pattern: new RegExp(
        `['"]gh['"]\\s*,|['"]gh\\s+(?:${GH_SUBCOMMANDS})\\b`,
        'g'
      ),
      fix: 'use apiclient.gh.run_gh (budgeted) or apiclient GitHubClient (batched GraphQL) instead of a gh subprocess',
    },
    {
      id: 'gh-subprocess',
      applies: path => CODE.test(path),
      pattern: new RegExp(
        `\\b(?:exec|execSync|execFile|execFileSync|spawn|spawnSync)\\(\\s*['"\`]gh\\b|\`gh\\s+(?:${GH_SUBCOMMANDS})\\b`,
        'g'
      ),
      fix: 'use runGh() or createGitHubClient() from packages/api-client',
    },
    {
      id: 'gh-shell',
      applies: path => SHELL.test(path) || YAML.test(path),
      pattern: new RegExp(
        `(?:^|[\\s;&|(\`$"'])(?:gh|gh_retry)\\s+(?:${GH_SUBCOMMANDS})\\b`,
        'gm'
      ),
      fix: 'run `node packages/api-client/cli.ts gh --priority <merge|deploy|repair|default|report|poll> -- <args>`',
    },
    {
      id: 'github-script',
      applies: path => YAML.test(path),
      pattern: /uses:\s*actions\/github-script@/g,
      fix: 'move the API calls into a script that uses packages/api-client',
    },
  ];
}

export function inScope(path) {
  return (
    SCANNED.test(path) &&
    !NOT_SOURCE.test(path) &&
    !CLIENT_LAYER.some(re => re.test(path))
  );
}

/** Per-file, per-rule hit counts with the first few line numbers. */
export function scanSource(path, text, rules) {
  const hits = {};
  for (const rule of rules) {
    if (!rule.applies(path)) continue;
    for (const match of text.matchAll(rule.pattern)) {
      const line = text.slice(0, match.index).split('\n').length;
      const row = (hits[rule.id] ??= { count: 0, lines: [], fix: rule.fix });
      row.count += 1;
      if (row.lines.length < 3) row.lines.push(line);
    }
  }
  return hits;
}

export function scanRepo(repoRoot, rules, files = trackedFiles(repoRoot)) {
  const found = {};
  for (const path of files) {
    if (!inScope(path)) continue;
    let text;
    try {
      text = readFileSync(join(repoRoot, path), 'utf8');
    } catch {
      continue;
    }
    const hits = scanSource(path, text, rules);
    if (Object.keys(hits).length) found[path] = hits;
  }
  return found;
}

export function trackedFiles(repoRoot) {
  const listed = spawnSync('git', ['ls-files', '-z'], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (listed.status !== 0)
    throw new Error(`git ls-files failed: ${listed.stderr}`);
  return listed.stdout.split('\0').filter(Boolean);
}

export function countsOf(found) {
  const counts = {};
  for (const [path, hits] of Object.entries(found)) {
    for (const [rule, row] of Object.entries(hits))
      (counts[path] ??= {})[rule] = row.count;
  }
  return counts;
}

function allowedBy(allowlist, path, rule) {
  return (
    allowlist.find(entry => entry.path === path && entry.rule === rule) ?? null
  );
}

/**
 * @returns {string[]} errors; empty means the tree honors the contract.
 */
export function checkGuard({
  found,
  ratchet,
  allowlist,
  baseRatchet = null,
  onboarded = {},
  baseCounts = null,
}) {
  const errors = [];
  for (const entry of allowlist) {
    if (
      !entry.path ||
      !entry.rule ||
      !(entry.max >= 1) ||
      String(entry.reason ?? '').length < 20
    ) {
      errors.push(
        `${ALLOWLIST_PATH}: entry ${JSON.stringify(entry)} needs path, rule, max >= 1 and a reason (>= 20 chars)`
      );
    }
  }
  for (const [path, hits] of Object.entries(found)) {
    for (const [rule, row] of Object.entries(hits)) {
      const allow = allowedBy(allowlist, path, rule);
      const onBase = baseCounts?.[path]?.[rule] ?? 0;
      const ceiling = Math.max(
        allow ? allow.max : (ratchet[path]?.[rule] ?? 0),
        onBase
      );
      if (row.count > ceiling) {
        errors.push(
          `${path}:${row.lines.join(',')} ${rule}: ${row.count} direct call(s), ${ceiling} grandfathered. ` +
            `Fix: ${row.fix}. Contract: .claude/rules/external-apis.md`
        );
      }
    }
  }
  for (const [path, rules] of Object.entries(ratchet)) {
    for (const [rule, count] of Object.entries(rules)) {
      const now = found[path]?.[rule]?.count ?? 0;
      // A drop that is already on the base revision came from main, not this PR.
      const droppedOnBase =
        baseCounts !== null && (baseCounts[path]?.[rule] ?? 0) < count;
      if (now < count && !droppedOnBase) {
        errors.push(
          `${RATCHET_PATH}: ${path} ${rule} is ${now}, ratchet says ${count}; lower it (node scripts/external-api-guard.mjs --write)`
        );
      }
      const base = baseRatchet?.[path]?.[rule] ?? 0;
      const admitted = rule === 'provider-host' ? (onboarded[path] ?? 0) : 0;
      if (baseRatchet && count > base + admitted) {
        errors.push(
          `${RATCHET_PATH}: ${path} ${rule} rose to ${count} (base ${base}); the ratchet only shrinks, except for calls to a provider newly added to providers.json (--onboard)`
        );
      }
    }
  }
  return errors;
}

/** Grandfather today's calls to newly registered provider hosts. */
export function onboardRatchet(ratchet, found, onboarded) {
  const next = structuredClone(ratchet);
  for (const [path, extra] of Object.entries(onboarded)) {
    const now = found[path]?.['provider-host']?.count ?? 0;
    const current = next[path]?.['provider-host'] ?? 0;
    const target = Math.min(now, current + extra);
    if (target > current) (next[path] ??= {})['provider-host'] = target;
  }
  return Object.fromEntries(
    Object.keys(next)
      .sort()
      .map(path => [path, next[path]])
  );
}

/** Lower every grandfathered count to today's value; never add entries. */
export function tightenRatchet(ratchet, found) {
  const next = {};
  for (const path of Object.keys(ratchet).sort()) {
    for (const rule of Object.keys(ratchet[path]).sort()) {
      const now = Math.min(
        ratchet[path][rule],
        found[path]?.[rule]?.count ?? 0
      );
      if (now > 0) (next[path] ??= {})[rule] = now;
    }
  }
  return next;
}

export function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

export function loadProviders(repoRoot) {
  return JSON.parse(readFileSync(join(repoRoot, PROVIDERS_PATH), 'utf8'));
}

/** providers.json on the revision this diff is measured against, or null. */
export function baseProvidersAt(ref, repoRoot) {
  if (!ref) return null;
  const shown = spawnSync('git', ['show', `${ref}:${PROVIDERS_PATH}`], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (shown.status !== 0) return null;
  try {
    return JSON.parse(shown.stdout);
  } catch {
    return null;
  }
}

/** The ratchet on the revision this diff is measured against, or null. */
export function baseRatchetAt(ref, repoRoot) {
  if (!ref) return null;
  const shown = spawnSync('git', ['show', `${ref}:${RATCHET_PATH}`], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (shown.status !== 0) return null;
  try {
    return JSON.parse(shown.stdout).entries ?? null;
  } catch {
    return null;
  }
}

/**
 * Per-(file, rule) counts on `ref`, for the files in `paths`, read in one
 * `git cat-file --batch`. Returns null when the ref is unavailable.
 */
export function baseCountsAt(ref, repoRoot, rules, paths) {
  if (!ref) return null;
  const wanted = [...new Set(paths)].filter(inScope);
  const shown = spawnSync('git', ['cat-file', '--batch'], {
    cwd: repoRoot,
    input: wanted.map(path => `${ref}:${path}\n`).join(''),
    maxBuffer: 256 * 1024 * 1024,
  });
  if (shown.status !== 0) return null;
  const out = shown.stdout;
  const counts = {};
  let at = 0;
  for (const path of wanted) {
    const eol = out.indexOf(10, at);
    if (eol < 0) return null;
    const header = out.subarray(at, eol).toString('utf8');
    at = eol + 1;
    if (header.endsWith(' missing') || header.endsWith(' ambiguous')) continue;
    const size = Number(header.split(' ')[2]);
    if (!Number.isFinite(size)) return null;
    const text = out.subarray(at, at + size).toString('utf8');
    at += size + 1;
    for (const [rule, row] of Object.entries(scanSource(path, text, rules)))
      (counts[path] ??= {})[rule] = row.count;
  }
  return counts;
}

export function ciBase(repoRoot, env = process.env) {
  if (env.TURBO_SCM_BASE) return env.TURBO_SCM_BASE;
  const merged = spawnSync('git', ['merge-base', 'HEAD', 'origin/main'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  return merged.status === 0 ? merged.stdout.trim() : null;
}
