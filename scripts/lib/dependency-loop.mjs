// Dependency-update loop policy (pure, no I/O): classify Dependabot PRs,
// decide the event-driven action for each, and compute dwell/lag metrics.
//
//   patch/minor  -> the queue path admits green heads (Merge Queue Green Enroll);
//                   a DIRTY head gets one `@dependabot recreate` per 24h.
//   major        -> an agent migration issue (read changelog, change code, run
//                   tests) instead of an indefinite hold.

const HOUR_MS = 3_600_000;
export const REBASE_COOLDOWN_HOURS = 24;
export const REBASE_MARKER = '<!-- dependency-loop:rebase -->';

const FROM_TO = /bump (\S+) from (\S+) to (\S+)/i;
const GROUP = /bump the (\S+) group/i;

function majorOf(version) {
  const m = /^[v=]?(\d+)\./.exec(String(version ?? '').trim());
  return m ? Number(m[1]) : null;
}

export function classifyPr(pr) {
  const title = pr.title ?? '';
  const branch = pr.headRefName ?? '';
  const single = FROM_TO.exec(title);
  const group = GROUP.exec(title);
  let kind = 'unknown';
  let name = null;
  let from = null;
  let to = null;
  if (single) {
    [, name, from, to] = single;
    const a = majorOf(from);
    const b = majorOf(to);
    if (a !== null && b !== null) {
      kind =
        b > a
          ? 'major'
          : from.split('.')[1] !== to.split('.')[1]
            ? 'minor'
            : 'patch';
    }
  } else if (group) {
    name = group[1];
    // Dependabot groups are named in dependabot.yml; majors live in *-major groups.
    kind =
      /(^|-)major$/.test(name) && !/non-major$/.test(name) ? 'major' : 'minor';
  }
  if (kind === 'unknown' && /dependabot\/github_actions\//.test(branch))
    kind = 'minor';
  const ecosystem =
    /dependabot\/(github_actions|npm_and_yarn|pip|docker)/.exec(branch)?.[1] ??
    'unknown';
  return { kind, name, from, to, ecosystem };
}

export function migrationFingerprint(c) {
  const slug = String(c.name ?? 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `depmajor-${slug}${c.to ? `-${String(c.to).replace(/[^a-z0-9]+/gi, '-')}` : ''}`.slice(
    0,
    60
  );
}

export function migrationIssue(pr, c) {
  return {
    fingerprint: migrationFingerprint(c),
    title: `Migrate ${c.name} ${c.from ? `${c.from} -> ${c.to}` : '(major)'} [${migrationFingerprint(c)}]`,
    description: [
      `Dependabot opened ${pr.url} (open since ${pr.createdAt}). A major update is held for a migration, not left to sit.`,
      '',
      '## Do',
      '1. Read the changelog and release notes between the two versions; list breaking changes that touch this repo.',
      '2. Make the code changes on the Dependabot branch or a new branch from main, keep the lockfile minimal.',
      '3. Run the real tests for every touched surface, then let CI prove it. Add a regression test per breaking change handled.',
      '4. If the major cannot be adopted yet, record why with a dated Re-evaluate-when trigger and close this issue.',
      '',
      `Loop fingerprint: ${migrationFingerprint(c)}`,
    ].join('\n'),
  };
}

/**
 * Decide what the loop does for one open Dependabot PR.
 * @returns {{action: 'migrate'|'recreate'|'none', reason: string}}
 */
export function decide(pr, now = new Date()) {
  const c = classifyPr(pr);
  const labels = (pr.labels ?? []).map(l =>
    typeof l === 'string' ? l : l.name
  );
  if (labels.includes('hold') && c.kind !== 'major')
    return { action: 'none', reason: 'durable-hold', class: c };
  if (c.kind === 'major')
    return { action: 'migrate', reason: 'major-update', class: c };
  if (pr.mergeStateStatus === 'DIRTY') {
    const last = (pr.comments ?? [])
      .filter(x => String(x.body ?? '').includes(REBASE_MARKER))
      .map(x => Date.parse(x.createdAt))
      .sort((a, b) => b - a)[0];
    if (last && now.getTime() - last < REBASE_COOLDOWN_HOURS * HOUR_MS) {
      return {
        action: 'none',
        reason: 'recreate-requested-recently',
        class: c,
      };
    }
    return { action: 'recreate', reason: 'dirty-head', class: c };
  }
  return {
    action: 'none',
    reason:
      pr.mergeStateStatus === 'BLOCKED' ? 'awaiting-green-enroll' : 'clean',
    class: c,
  };
}

function percentile(values, p) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
}

/** Dwell of open update PRs, merge latency of recent ones, majors held and their age. */
export function dependencyMetrics({ open, merged = [], now = new Date() }) {
  const ageH = pr => (now.getTime() - Date.parse(pr.createdAt)) / HOUR_MS;
  const rows = open.map(pr => ({ pr, c: classifyPr(pr) }));
  const dwell = rows.map(r => ageH(r.pr));
  const majors = rows.filter(r => r.c.kind === 'major');
  const toMerge = merged
    .filter(pr => pr.mergedAt)
    .map(pr => (Date.parse(pr.mergedAt) - Date.parse(pr.createdAt)) / HOUR_MS);
  const byState = {};
  for (const { pr } of rows)
    byState[pr.mergeStateStatus] = (byState[pr.mergeStateStatus] ?? 0) + 1;
  return {
    openUpdatePrs: open.length,
    byMergeState: byState,
    byKind: rows.reduce(
      (m, r) => ({ ...m, [r.c.kind]: (m[r.c.kind] ?? 0) + 1 }),
      {}
    ),
    // Lag proxy: each open update PR is one package family behind its latest release.
    packagesBehind: open.length,
    dwellHours: {
      p50: percentile(dwell, 50),
      p95: percentile(dwell, 95),
      oldest: dwell.length ? Math.max(...dwell) : null,
    },
    majorsOpen: majors.length,
    majorsOldestHours: majors.length
      ? Math.max(...majors.map(r => ageH(r.pr)))
      : null,
    mergedLast30d: merged.length,
    timeToMergeHours: {
      n: toMerge.length,
      p50: percentile(toMerge, 50),
      p95: percentile(toMerge, 95),
    },
  };
}
