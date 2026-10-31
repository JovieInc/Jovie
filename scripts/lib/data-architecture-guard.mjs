/**
 * Scanner for the data architecture guard (scripts/data-architecture-guard.mjs).
 * Encodes docs/architecture/data-architecture-adr-2026-10-29.md: one way to
 * read (RSC + cache tags), one way to mutate (server action or route handler
 * + a scoped tag), one client cache (TanStack Query), one DB client.
 * Pure functions so the contract test can drive them with fixtures.
 *
 * Escape hatch, per occurrence: `data-arch-allow: <reason>` (10+ chars) on the
 * same line or the line above. Allows are counted and reported.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const RATCHET_PATH =
  'scripts/lib/data-architecture-guard.ratchet.gen.json';
export const RATCHET_SCHEMA = 'jovie-data-architecture-ratchet/v1';
export const REGISTRY_PATH = 'canon/data-architecture.json';
export const ADR_PATH = 'docs/architecture/data-architecture-adr-2026-10-29.md';

const APPS = 'web|ovie|console|docs|should-i-make';
const SCANNED = new RegExp(
  `^apps\\/(?:${APPS})\\/(?!scripts\\/|drizzle\\/|tests?\\/|e2e\\/|\\.storybook\\/|public\\/).+\\.(?:ts|tsx|mts|js|jsx)$`
);
const NOT_SOURCE =
  /(?:\.test\.|\.spec\.|\.stories\.|\.gen\.|\.d\.ts$|(?:^|\/)(?:__tests__|__mocks__|tests?|fixtures|testing|test-utils|node_modules)\/|test-utils\.|\.config\.(?:ts|js|mjs|mts)$)/;
/** The canonical DB module may construct the pool and open transactions. */
const DB_HOME = /^apps\/web\/lib\/db\//;

/** Rule ids, in report order. Descriptions are the fix, not the symptom. */
export const RULES = Object.freeze({
  'revalidate-path':
    'revalidatePath() re-renders a whole route. Revalidate the cache tag of the data you changed (updateTag in a server action, revalidateTag(tag, "max") elsewhere).',
  'revalidate-path-broad':
    "revalidatePath('/') or a 'layout' revalidation invalidates every page under it. Scope to the changed record's tag.",
  'global-tag-revalidate':
    "A cross-tenant family tag (profiles-all, dashboard-data) flushes every user's cache. Use the per-record tag (profile:<handle>, releases:<user>:<profile>).",
  'router-refresh':
    'router.refresh() after a mutation re-fetches the entire route tree. Update the affected TanStack Query key (setQueryData / invalidateQueries({ queryKey: exactKey })) or let the server action return the new value.',
  'route-segment-config':
    "export const dynamic/revalidate/fetchCache blocks cacheComponents. Remove it: dynamic data is request-time by default; cache with 'use cache' + cacheLife + cacheTag.",
  'unstable-cache':
    "unstable_cache is the legacy data cache. Use a 'use cache' function with cacheTag + cacheLife.",
  'no-store':
    'noStore() is redundant under Cache Components. Use await connection() only when a request-time boundary is needed.',
  'fetch-in-effect':
    'fetch() inside useEffect duplicates server data and races. Read on the server (RSC) or use a TanStack Query hook from lib/queries.',
  polling:
    'Polling (refetchInterval / setInterval + fetch). Push the change instead (SSE stream or refetch on the mutation event); keep a poll only with a data-arch-allow reason.',
  'db-client-path':
    "A second DB client or driver import. Import { db } from '@/lib/db' only.",
  'runtime-nodejs-export':
    "export const runtime = 'nodejs' restates the default and is a Cache Components migration blocker (JOV-7987). Delete it.",
  'network-in-transaction':
    'Network I/O inside a transaction holds a pooled connection open. Do the I/O first, then open the transaction with precomputed values.',
  'await-db-in-loop':
    'await db/tx inside a loop is N+1. Batch with inArray / a single insert().values([...]) or Promise.all over a bounded set.',
});

const ALLOW = /data-arch-allow:\s*\S.{9,}/;

/** Blank out comments and string contents, keeping offsets and newlines. */
export function maskSource(text) {
  let out = '';
  let i = 0;
  const n = text.length;
  const keep = ch => (ch === '\n' ? '\n' : ' ');
  while (i < n) {
    const c = text[i];
    const d = text[i + 1];
    if (c === '/' && d === '/') {
      while (i < n && text[i] !== '\n') {
        out += ' ';
        i++;
      }
    } else if (c === '/' && d === '*') {
      out += '  ';
      i += 2;
      while (i < n && !(text[i] === '*' && text[i + 1] === '/')) {
        out += keep(text[i]);
        i++;
      }
      out += '  ';
      i += 2;
    } else if (c === "'" || c === '"' || c === '`') {
      // Keep the quotes and contents of short literals: rules match on
      // literal arguments like revalidatePath('/') and 'force-dynamic'.
      const q = c;
      out += c;
      i++;
      while (i < n && text[i] !== q) {
        if (text[i] === '\\') {
          out += '  ';
          i += 2;
          continue;
        }
        if (q === '`' && text[i] === '$' && text[i + 1] === '{') {
          out += '${';
          i += 2;
          let depth = 1;
          while (i < n && depth > 0) {
            if (text[i] === '{') depth++;
            else if (text[i] === '}') depth--;
            out += depth === 0 ? '}' : keep(text[i]);
            i++;
          }
          continue;
        }
        out += text[i] === '\n' ? '\n' : text[i];
        i++;
      }
      if (i < n) {
        out += q;
        i++;
      }
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/** Index just past the bracket that closes the one at `open`. */
function closeOf(masked, open) {
  const pairs = { '(': ')', '{': '}', '[': ']' };
  const stack = [pairs[masked[open]]];
  for (let i = open + 1; i < masked.length; i++) {
    const ch = masked[i];
    if (pairs[ch]) stack.push(pairs[ch]);
    else if (ch === stack[stack.length - 1]) {
      stack.pop();
      if (!stack.length) return i + 1;
    } else if (ch === "'" || ch === '"' || ch === '`') {
      const q = ch;
      i++;
      while (i < masked.length && masked[i] !== q) i++;
    }
  }
  return masked.length;
}

/** [start, end) ranges of the argument list of each call matched by `re`. */
function callRanges(masked, re) {
  const ranges = [];
  for (const m of masked.matchAll(re)) {
    const open = masked.indexOf('(', m.index + m[0].length - 1);
    if (open < 0) continue;
    ranges.push([open, closeOf(masked, open)]);
  }
  return ranges;
}

/** [start, end) ranges of for/while loop bodies. */
function loopRanges(masked) {
  const ranges = [];
  for (const m of masked.matchAll(/\b(?:for(?:\s+await)?|while)\s*\(/g)) {
    const open = m.index + m[0].length - 1;
    const headEnd = closeOf(masked, open);
    // Chunked batch writes (for (const batch of chunk(rows, N))) are the fix,
    // not the bug.
    if (/\b(?:chunk|batch|page)\w*/i.test(masked.slice(open, headEnd)))
      continue;
    let j = headEnd;
    while (j < masked.length && /\s/.test(masked[j])) j++;
    if (masked[j] === '{') ranges.push([j, closeOf(masked, j)]);
    else {
      const semi = masked.indexOf(';', j);
      ranges.push([j - 1, semi < 0 ? masked.length : semi]);
    }
  }
  return ranges;
}

const within = (ranges, index) =>
  ranges.some(([a, b]) => index > a && index < b);

const isClient = text => /^\s*['"]use client['"]/m.test(text.slice(0, 400));

/**
 * Hits per rule for one file. `allowed` counts occurrences waived by a
 * data-arch-allow comment.
 */
export function scanSource(text, path = '') {
  const masked = maskSource(text);
  const lines = text.split('\n');
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++)
    if (text[i] === '\n') lineStarts.push(i + 1);
  const lineOf = index => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= index) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const hits = {};
  const where = {};
  let allowed = 0;
  const seen = new Set();
  const hit = (rule, index) => {
    const key = `${rule}:${index}`;
    if (seen.has(key)) return;
    seen.add(key);
    const line = lineOf(index);
    const above = lines[line - 1] ?? '';
    const commentAbove = /^\s*(?:\/\/|\*|\/\*|\{\/\*)/.test(above);
    if (ALLOW.test(lines[line] ?? '') || (commentAbove && ALLOW.test(above))) {
      allowed++;
      return;
    }
    hits[rule] = (hits[rule] ?? 0) + 1;
    (where[rule] ??= []).push(line + 1);
  };
  const each = (rule, re) => {
    for (const m of masked.matchAll(re)) hit(rule, m.index);
  };

  each('revalidate-path', /\brevalidatePath\s*\(/g);
  each(
    'revalidate-path-broad',
    /\brevalidatePath\s*\(\s*(?:['"`]\/['"`]\s*[,)]|[^()]*,\s*['"`]layout['"`])/g
  );
  each(
    'global-tag-revalidate',
    /\b(?:revalidateTag|updateTag)\s*\(\s*(?:CACHE_TAGS\.(?:PUBLIC_PROFILE|DASHBOARD_DATA)\b|['"`](?:profiles-all|dashboard-data)['"`])/g
  );
  each('router-refresh', /\brouter\s*\.\s*refresh\s*\(\s*\)/g);
  each(
    'route-segment-config',
    /^\s*export\s+const\s+(?:dynamic|revalidate|fetchCache)\s*[:=]/gm
  );
  each(
    'runtime-nodejs-export',
    /^\s*export\s+const\s+runtime\s*=\s*['"]nodejs['"]/gm
  );
  each('unstable-cache', /\bunstable_cache\b(?!\s*as\b)|\bunstableCache\s*\(/g);
  each('no-store', /\b(?:unstable_)?noStore\s*\(\s*\)/g);

  const effects = callRanges(masked, /\buseEffect\s*\(/g);
  for (const m of masked.matchAll(/(?<![.\w])fetch\s*\(/g))
    if (within(effects, m.index)) hit('fetch-in-effect', m.index);

  const client = isClient(text) || /(?:^|\/)use[A-Z][\w-]*\.tsx?$/.test(path);
  if (client) {
    each('polling', /\brefetchInterval\s*:/g);
    if (
      /(?<![.\w])fetch\s*\(|\brefetch\s*\(|router\s*\.\s*refresh/.test(masked)
    )
      each('polling', /\bsetInterval\s*\(/g);
  }

  if (!DB_HOME.test(path)) {
    each(
      'db-client-path',
      /^\s*(?:import|export)\s+(?!type\b)[^;]*?\bfrom\s+['"](?:@\/lib\/db\/client(?:\/[\w-]+)?|pg|pg-pool|postgres|@neondatabase\/serverless|drizzle-orm\/(?:neon-http|neon-serverless|node-postgres|postgres-js))['"]/gm
    );
    each('db-client-path', /(?<![.\w])(?:drizzle|neon)\s*\(\s*(?!\))/g);
    each('db-client-path', /\bnew\s+Pool\s*\(/g);
  }

  const txs = callRanges(masked, /\.\s*transaction\s*\(/g);
  for (const m of masked.matchAll(
    /(?<![.\w])fetch\s*\(|\b(?:stripe|resend|openai|anthropic)\s*\.\s*\w+/g
  ))
    if (within(txs, m.index)) hit('network-in-transaction', m.index);

  const loops = loopRanges(masked);
  for (const m of masked.matchAll(/\bawait\s+(?:db|tx|trx|database)\s*\./g))
    if (within(loops, m.index)) hit('await-db-in-loop', m.index);

  return { hits, where, allowed };
}

export function inScope(path) {
  return SCANNED.test(path) && !NOT_SOURCE.test(path);
}

export function trackedFiles(root) {
  const listed = spawnSync('git', ['ls-files', '-z', 'apps'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1 << 28,
  });
  if (listed.status !== 0) throw new Error(`git ls-files: ${listed.stderr}`);
  return listed.stdout.split('\0').filter(Boolean);
}

export function scanRepo(root, files = trackedFiles(root)) {
  const found = {};
  const where = {};
  let allowed = 0;
  for (const path of files) {
    if (!inScope(path)) continue;
    let text;
    try {
      text = readFileSync(join(root, path), 'utf8');
    } catch {
      continue;
    }
    const scan = scanSource(text, path);
    allowed += scan.allowed;
    if (!Object.keys(scan.hits).length) continue;
    found[path] = scan.hits;
    where[path] = scan.where;
  }
  return { found, where, allowed };
}

export function totalsOf(entries) {
  const totals = Object.fromEntries(Object.keys(RULES).map(r => [r, 0]));
  for (const rules of Object.values(entries))
    for (const [rule, n] of Object.entries(rules))
      totals[rule] = (totals[rule] ?? 0) + n;
  return totals;
}

export function checkRatchet(counts, ratchet) {
  const errors = [];
  const stale = [];
  for (const [path, rules] of Object.entries(counts))
    for (const [rule, n] of Object.entries(rules)) {
      const cap = ratchet[path]?.[rule] ?? 0;
      if (n > cap)
        errors.push(
          `${path}: ${rule} ${n}x (allowed ${cap}). ${RULES[rule]} See ${ADR_PATH}.`
        );
      else if (n < cap) stale.push(`${path} ${rule} ${cap} -> ${n}`);
    }
  for (const [path, rules] of Object.entries(ratchet))
    for (const [rule, cap] of Object.entries(rules))
      if (!counts[path]?.[rule]) stale.push(`${path} ${rule} ${cap} -> 0`);
  return { errors, stale };
}

/** Lowered ratchet: existing caps shrink to the current count, never grow. */
export function lowerRatchet(counts, ratchet) {
  const next = {};
  for (const [path, rules] of Object.entries(counts))
    for (const [rule, n] of Object.entries(rules)) {
      const cap = ratchet[path]?.[rule];
      if (cap !== undefined && Math.min(n, cap) > 0)
        (next[path] ??= {})[rule] = Math.min(n, cap);
    }
  return next;
}

/** Ratchet saved on the base revision, or null when absent (first adoption). */
export function baseRatchetAt(root, env = process.env) {
  const base = env.GITHUB_BASE_REF
    ? `origin/${env.GITHUB_BASE_REF}`
    : 'origin/main';
  const mb = spawnSync('git', ['merge-base', 'HEAD', base], {
    cwd: root,
    encoding: 'utf8',
  });
  if (mb.status !== 0) return null;
  const shown = spawnSync(
    'git',
    ['show', `${mb.stdout.trim()}:${RATCHET_PATH}`],
    {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 1 << 26,
    }
  );
  return shown.status === 0 ? JSON.parse(shown.stdout) : null;
}

/** A PR may lower the ratchet, never raise or add to it. */
export function checkAgainstBase(saved, base) {
  if (!base) return [];
  const errors = [];
  for (const [path, rules] of Object.entries(saved.entries ?? {}))
    for (const [rule, n] of Object.entries(rules)) {
      const cap = base.entries?.[path]?.[rule] ?? 0;
      if (n > cap)
        errors.push(`ratchet raised for ${path} ${rule}: ${cap} -> ${n}`);
    }
  return errors;
}

/**
 * Every dependency of a scanned app that is a data library must be listed in
 * canon/data-architecture.json `libraries` with its role. A new data library
 * needs an ADR entry first.
 */
export function checkLibraries(root, registry) {
  const errors = [];
  const watched = new RegExp(registry.watchedDependencyPattern);
  const approved = new Map(registry.libraries.map(l => [l.name, l]));
  for (const app of APPS.split('|')) {
    let pkg;
    try {
      pkg = JSON.parse(
        readFileSync(join(root, 'apps', app, 'package.json'), 'utf8')
      );
    } catch {
      continue;
    }
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const name of Object.keys(deps)) {
      if (!watched.test(name)) continue;
      const entry = approved.get(name);
      if (!entry)
        errors.push(
          `apps/${app} depends on data library ${name}, which has no entry in ${REGISTRY_PATH}. Add it to the ADR (${ADR_PATH}) first, or use the approved library for that role.`
        );
      else if (entry.apps && !entry.apps.includes(app))
        errors.push(
          `apps/${app} depends on ${name}; ${REGISTRY_PATH} approves it only for ${entry.apps.join(', ')}.`
        );
    }
  }
  return errors;
}

export function loadRegistry(root) {
  return JSON.parse(readFileSync(join(root, REGISTRY_PATH), 'utf8'));
}

/** Top offenders per rule, for the audit and the remediation sweep. */
export function topOffenders(entries, rule, limit = 10) {
  return Object.entries(entries)
    .filter(([, rules]) => rules[rule])
    .map(([path, rules]) => [path, rules[rule]])
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);
}
