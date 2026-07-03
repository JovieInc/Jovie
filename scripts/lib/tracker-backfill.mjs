/**
 * Tracker migration phase 4 — one-shot Linear → GitHub Issues backfill.
 *
 * Exports open Linear JOV issues (GraphQL, paginated) and files an equivalent
 * GitHub issue for each via the phase-1 `fileGithubIssue` facade. Every backfill
 * body carries a `<!-- linear-issue: JOV-XXXX -->` marker: it preserves the
 * Linear identifier for traceability AND makes the script idempotent — a re-run
 * skips issues whose marker already exists in a GitHub issue body.
 *
 * Dry-run by default. Creating dozens of real issues (and the `status:*` / P0–P4
 * labels) is an operator action: pass `--execute` to actually write. Run it only
 * once the phase-2/3 parallel run is live.
 *
 *   doppler run --project jovie-web --config dev -- \
 *     node scripts/lib/tracker-backfill.mjs            # dry-run (default)
 *   doppler run --project jovie-web --config dev -- \
 *     node scripts/lib/tracker-backfill.mjs --execute  # create issues + labels
 *
 * Linear priority integers: 0 None, 1 Urgent, 2 High, 3 Medium, 4 Low.
 */

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { fileGithubIssue } from './tracker.mjs';

const LINEAR_API = 'https://api.linear.app/graphql';

/** Linear `state.type` → GitHub `status:*` label. */
const STATUS_LABELS = Object.freeze({
  triage: 'status:triage',
  backlog: 'status:backlog',
  unstarted: 'status:todo',
  started: 'status:in-progress',
  completed: 'status:done',
  canceled: 'status:canceled',
});

/** Linear priority int → GitHub P0–P4 label (urgent is most severe = P0). */
const PRIORITY_LABELS = Object.freeze({
  1: 'P0',
  2: 'P1',
  3: 'P2',
  4: 'P3',
  0: 'P4',
});

const LABEL_COLORS = Object.freeze({
  P0: 'd73a49',
  P1: 'e99695',
  P2: 'fbca04',
  P3: 'c2e0c6',
  P4: 'ededed',
});

/** The fixed label set this backfill maps onto. */
export const BACKFILL_LABELS = Object.freeze([
  ...Object.values(STATUS_LABELS),
  'P0',
  'P1',
  'P2',
  'P3',
  'P4',
]);

/** Matches the traceability marker in a GitHub issue body. */
export const LINEAR_MARKER_RE = /linear-issue:\s*(JOV-\d+)/gi;

/** @param {string} identifier e.g. "JOV-1234" */
export function backfillMarker(identifier) {
  return `<!-- linear-issue: ${identifier} -->`;
}

/** @param {number | null | undefined} priority Linear priority int */
export function mapPriority(priority) {
  return PRIORITY_LABELS[priority] ?? 'P4';
}

/** @param {string | null | undefined} stateType Linear state.type */
export function mapState(stateType) {
  return STATUS_LABELS[stateType] ?? 'status:backlog';
}

/** @param {{ state?: { type?: string }, priority?: number }} issue */
export function labelsFor(issue) {
  return [mapState(issue.state?.type), mapPriority(issue.priority)];
}

/**
 * @param {{ identifier: string, title: string, description?: string,
 *   url?: string, priorityLabel?: string, state?: { name?: string } }} issue
 */
export function buildBackfillBody(issue) {
  const state = issue.state?.name ?? 'Unknown';
  const priority = issue.priorityLabel ?? 'No priority';
  const description =
    issue.description?.trim() || '_No description in Linear._';
  return [
    '## Migrated from Linear',
    `> Original: [${issue.identifier}](${issue.url ?? ''}) — state: ${state} · priority: ${priority}`,
    '',
    description,
    '',
    backfillMarker(issue.identifier),
  ].join('\n');
}

/**
 * Collect JOV identifiers already present in migrated GitHub issue bodies.
 * @param {readonly string[]} bodies
 * @returns {Set<string>}
 */
export function extractMigratedIds(bodies) {
  const ids = new Set();
  for (const body of bodies) {
    for (const match of String(body ?? '').matchAll(LINEAR_MARKER_RE)) {
      ids.add(match[1].toUpperCase());
    }
  }
  return ids;
}

/**
 * Normalize a Linear GraphQL node into the shape the backfill consumes.
 * @param {Record<string, any>} node
 */
export function normalizeLinearIssue(node) {
  return {
    identifier: node.identifier,
    title: node.title,
    description: node.description ?? '',
    priority: node.priority ?? 0,
    priorityLabel: node.priorityLabel ?? 'No priority',
    url: node.url ?? '',
    state: { name: node.state?.name ?? '', type: node.state?.type ?? '' },
    labels: (node.labels?.nodes ?? []).map(l => l.name),
  };
}

const OPEN_ISSUES_QUERY = `query OpenIssues($after: String) {
  issues(
    first: 100
    after: $after
    filter: { team: { key: { eq: "JOV" } }, state: { type: { nin: ["completed", "canceled"] } } }
    orderBy: updatedAt
  ) {
    pageInfo { hasNextPage endCursor }
    nodes {
      identifier title description priority priorityLabel url
      state { name type }
      labels { nodes { name } }
    }
  }
}`;

/**
 * Fetch every open Linear JOV issue (paginated). Read-only.
 * @param {{ fetchFn?: typeof fetch, key?: string }} [deps]
 */
export async function fetchOpenLinearIssues(deps = {}) {
  const fetchFn = deps.fetchFn ?? fetch;
  const key = deps.key ?? process.env.LINEAR_API_KEY;
  if (!key) throw new Error('LINEAR_API_KEY missing');

  const issues = [];
  let after = null;
  // Bounded so a malformed pageInfo can never spin forever.
  for (let page = 0; page < 100; page++) {
    const res = await fetchFn(LINEAR_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: key },
      body: JSON.stringify({ query: OPEN_ISSUES_QUERY, variables: { after } }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      throw new Error(
        `Linear ${res.status}: ${await res.text().catch(() => '')}`
      );
    }
    const json = await res.json();
    if (json.errors?.length) {
      throw new Error(`Linear GraphQL errors: ${JSON.stringify(json.errors)}`);
    }
    const conn = json.data?.issues;
    for (const node of conn?.nodes ?? [])
      issues.push(normalizeLinearIssue(node));
    if (!conn?.pageInfo?.hasNextPage) break;
    after = conn.pageInfo.endCursor;
  }
  return issues;
}

function defaultGhExec(args) {
  return execFileSync('gh', args, { encoding: 'utf8' });
}

/**
 * JOV identifiers already backfilled into GitHub (scans issue bodies once).
 * @param {(args: string[]) => string} [exec]
 * @returns {Set<string>}
 */
export function fetchMigratedIds(exec = defaultGhExec) {
  const out = exec([
    'issue',
    'list',
    '--state',
    'all',
    '--search',
    'linear-issue: in:body',
    '--json',
    'body',
    '--limit',
    '1000',
  ]);
  /** @type {Array<{ body?: string }>} */
  const rows = JSON.parse(out || '[]');
  return extractMigratedIds(rows.map(r => r.body ?? ''));
}

/** Create the fixed backfill label set. Idempotent (`--force`). Best-effort. */
export function ensureLabels(exec = defaultGhExec) {
  for (const name of BACKFILL_LABELS) {
    const color = LABEL_COLORS[name] ?? '0969da';
    try {
      exec(['label', 'create', name, '--color', color, '--force']);
    } catch {
      // A pre-existing label or a transient failure must not abort the backfill.
    }
  }
}

/**
 * Backfill open Linear issues into GitHub. All I/O is injected so the loop is
 * unit-testable. Never throws on a per-issue failure — it tallies and continues.
 *
 * @param {object} opts
 * @param {() => Promise<any[]>} opts.fetchIssues
 * @param {Set<string>} opts.migratedIds
 * @param {(input: { title: string, body: string, labels: string[] }) => any} opts.fileIssue
 * @param {boolean} [opts.execute]
 * @param {(msg: string) => void} [opts.log]
 */
export async function runBackfill(opts) {
  const { fetchIssues, migratedIds, fileIssue, execute = false } = opts;
  const log = opts.log ?? (() => {});
  const issues = await fetchIssues();
  const summary = {
    total: issues.length,
    created: 0,
    skipped: 0,
    failed: 0,
    dryRun: !execute,
    failures: /** @type {Array<{ identifier: string, error?: string }>} */ ([]),
  };

  for (const issue of issues) {
    if (migratedIds.has(issue.identifier?.toUpperCase())) {
      summary.skipped++;
      log(`skip ${issue.identifier} (already migrated)`);
      continue;
    }
    const labels = labelsFor(issue);
    const title = `${issue.identifier}: ${issue.title}`;
    if (!execute) {
      summary.created++;
      log(`[dry-run] would create "${title}" labels=${labels.join(',')}`);
      continue;
    }
    const res = fileIssue({ title, body: buildBackfillBody(issue), labels });
    if (res.success) {
      summary.created++;
      log(
        `created ${res.identifier} ← ${issue.identifier}${res.labelsDropped ? ' (labels dropped)' : ''}`
      );
    } else {
      summary.failed++;
      summary.failures.push({ identifier: issue.identifier, error: res.error });
      log(`FAILED ${issue.identifier}: ${res.error}`);
    }
  }
  return summary;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      'Usage: tracker-backfill.mjs [--execute] [--limit N]\n' +
        '  (default) dry-run: print what would be created, write nothing\n' +
        '  --execute   create GitHub issues + backfill labels\n' +
        '  --limit N   cap the number of issues processed'
    );
    return;
  }
  const execute = args.includes('--execute');
  const limitFlag = args.indexOf('--limit');
  const limit =
    limitFlag !== -1 ? Number.parseInt(args[limitFlag + 1] ?? '', 10) : null;

  if (execute) {
    console.log('Ensuring backfill labels exist…');
    ensureLabels();
  }

  const migratedIds = fetchMigratedIds();
  console.log(`${migratedIds.size} issue(s) already backfilled — will skip.`);

  const summary = await runBackfill({
    fetchIssues: async () => {
      const all = await fetchOpenLinearIssues();
      return Number.isInteger(limit) && limit > 0 ? all.slice(0, limit) : all;
    },
    migratedIds,
    fileIssue: input => fileGithubIssue(input),
    execute,
    log: msg => console.log(msg),
  });

  console.log(JSON.stringify(summary, null, 2));
  if (summary.failed > 0) process.exitCode = 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
