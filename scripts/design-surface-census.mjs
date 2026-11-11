import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const CENSUS_PATH = 'apps/web/data/designSystem/surfaceCensus.json';
const DAY = 86_400_000;
const STATUSES = ['canonical', 'migrating', 'holdout', 'intentional_exception'];
const requireValue = (condition, message) => {
  if (!condition) throw new Error(message);
};
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const timestamp = value =>
  nonempty(value) && Number.isFinite(Date.parse(value));
const sortedUnique = values =>
  Array.isArray(values) &&
  values.every(
    (value, i) => nonempty(value) && (i === 0 || values[i - 1] < value)
  );

export function discoverPages(root) {
  const walk = directory =>
    readdirSync(join(root, directory), { withFileTypes: true }).flatMap(
      entry => {
        const source = `${directory}/${entry.name}`;
        return entry.isDirectory()
          ? walk(source)
          : /^page\.[jt]sx?$/.test(entry.name)
            ? [source]
            : [];
      }
    );
  return walk('apps/web/app').sort();
}

export function expandCensus(census) {
  return census.groups
    .flatMap(({ sources, ...group }) =>
      sources.map(source => ({
        ...group,
        source,
        // Keep source identity: intercepted auth pages share URLs with full pages.
        route: `/${source
          .replace(/^apps\/web\/app\//, '')
          .split('/')
          .slice(0, -1)
          .filter(
            segment => !segment.startsWith('@') && !/^\([^)]*\)$/.test(segment)
          )
          .map(segment => segment.replace(/^\(\.\)/, ''))
          .join('/')}`,
        weight: Object.values(group.importance).reduce(
          (sum, value) => sum + value,
          0
        ),
      }))
    )
    .sort((a, b) => a.source.localeCompare(b.source));
}

// Certification evidence is one small file per certified source file:
//   <EVIDENCE_DIR>/<group id>/<source path with / as __>.json
//   { "file", "sha256", "at", "ref" }
// A canonical row is current when every file it is made of (its page and its
// expected owners) has an entry whose sha256 matches the bytes on disk.
//
// It used to be one digest over all of a row's files, stored on one line of
// surfaceCensus.json. A PR that changed one owner renewed that line against
// its own base, so a second PR changing another owner made the combined head
// stale even though both had renewed (and both rewrote the same line). With
// one entry per file, a PR renews only the files it changed, two PRs touch
// different entries, and the combined head is current without a third edit.
export const EVIDENCE_DIR = 'apps/web/data/designSystem/surfaceCensus.evidence';

/** The files a census row is certified against, sorted and unique. */
export function certifiedFiles(row) {
  return [...new Set([row.source, ...row.expectedOwners])].sort();
}

export function fileDigest(root, file) {
  return createHash('sha256')
    .update(readFileSync(join(root, file)))
    .digest('hex');
}

export function evidenceEntryPath(groupId, file) {
  return `${EVIDENCE_DIR}/${groupId}/${file.replaceAll('/', '__')}.json`;
}

/** Evidence entries recorded for a group, keyed by certified file. */
export function readEvidence(root, groupId) {
  const directory = join(root, EVIDENCE_DIR, groupId);
  const entries = new Map();
  if (!existsSync(directory)) return entries;
  for (const name of readdirSync(directory).sort()) {
    if (!name.endsWith('.json')) continue;
    const entry = JSON.parse(readFileSync(join(directory, name), 'utf8'));
    requireValue(
      nonempty(entry.file) &&
        evidenceEntryPath(groupId, entry.file).endsWith(`/${name}`),
      `${EVIDENCE_DIR}/${groupId}/${name}: entry name must match its file`
    );
    requireValue(
      /^[0-9a-f]{64}$/.test(entry.sha256 ?? '') &&
        timestamp(entry.at) &&
        nonempty(entry.ref),
      `${EVIDENCE_DIR}/${groupId}/${name}: needs sha256, at and ref`
    );
    entries.set(entry.file, entry);
  }
  return entries;
}

/** Certified files of a row whose bytes no longer match recorded evidence. */
export function staleFiles(root, row, evidence = readEvidence(root, row.id)) {
  return certifiedFiles(row)
    .map(file => ({
      file,
      sha256: fileDigest(root, file),
      recorded: evidence.get(file)?.sha256 ?? null,
    }))
    .filter(item => item.sha256 !== item.recorded);
}

export function validateCensus(
  census,
  pages,
  previous = null,
  now = Date.now()
) {
  requireValue(
    census.schema === 'jovie.design-surface-census/v1',
    'Unknown census schema'
  );
  requireValue(
    timestamp(census.startedAt) && Date.parse(census.startedAt) <= now,
    'Invalid census start'
  );
  requireValue(
    sortedUnique(census.groups.map(group => group.id)),
    'Sort unique census groups'
  );
  for (const group of census.groups) {
    requireValue(
      STATUSES.includes(group.status),
      `${group.id}: invalid status`
    );
    for (const field of ['area', 'owner', 'remainingScope', 'divergence']) {
      requireValue(nonempty(group[field]), `${group.id}: missing ${field}`);
    }
    requireValue(
      /^JOV-\d+$/.test(group.issue),
      `${group.id}: missing accountable issue`
    );
    requireValue(
      ['acquisition', 'revenue', 'usage'].every(
        key =>
          Number.isInteger(group.importance[key]) &&
          group.importance[key] >= 1 &&
          group.importance[key] <= 3
      ),
      `${group.id}: importance must be 1–3`
    );
    requireValue(
      group.expectedOwners.length > 0 && group.expectedOwners.every(nonempty),
      `${group.id}: missing canonical owners`
    );
    requireValue(
      group.sources.length > 0 && sortedUnique(group.sources),
      `${group.id}: sort unique sources`
    );
    requireValue(
      timestamp(group.evidence.at) &&
        Date.parse(group.evidence.at) <= now &&
        nonempty(group.evidence.ref),
      `${group.id}: missing dated evidence`
    );
    requireValue(
      ['source-audit', 'certification'].includes(group.evidence.kind),
      `${group.id}: invalid evidence kind`
    );
    if (group.status === 'canonical') {
      requireValue(
        group.evidence.kind === 'certification',
        `${group.id}: source registration is not certification`
      );
    }
    if (group.status === 'intentional_exception') {
      requireValue(
        nonempty(group.exception?.approvedBy) &&
          nonempty(group.exception?.reason) &&
          timestamp(group.exception?.reviewAt) &&
          Date.parse(group.exception.reviewAt) > now,
        `${group.id}: missing or expired approved exception`
      );
    }
  }
  requireValue(
    nonempty(census.excluded.reason) && sortedUnique(census.excluded.sources),
    'Declare fixture exclusions'
  );
  for (const source of census.excluded.sources) {
    requireValue(
      /\/(?:demo|dev|exp|ui|renders|profile-mode-render)\//.test(source) ||
        /\/(?:sandbox|sentry-example-page|spinner-test|demovideo)\/page.tsx$/.test(
          source
        ) ||
        source === 'apps/web/app/(marketing)/new/page.tsx' ||
        source.startsWith('apps/web/app/(marketing)/engineering/preview/'),
      `${source}: production pages cannot be fixture exclusions`
    );
  }
  const rows = expandCensus(census);
  const registered = [
    ...rows.map(row => row.source),
    ...census.excluded.sources,
  ].sort();
  requireValue(
    JSON.stringify(registered) === JSON.stringify([...pages].sort()),
    'Surface census must cover every page exactly once; declare new screens before release'
  );

  const bySource = new Map(rows.map(row => [row.source, row]));
  const history = new Map();
  let lastAt = Date.parse(census.startedAt);
  for (const event of census.transitions) {
    const at = Date.parse(event.at);
    requireValue(
      bySource.has(event.source) &&
        (event.from === null || STATUSES.includes(event.from)) &&
        STATUSES.includes(event.to) &&
        event.from !== event.to &&
        nonempty(event.evidence),
      'Invalid census transition'
    );
    requireValue(
      timestamp(event.at) && at >= lastAt && at <= now,
      'Transitions must be chronological and observed'
    );
    requireValue(
      !history.has(event.source) || history.get(event.source) === event.from,
      'Broken transition history'
    );
    history.set(event.source, event.to);
    lastAt = at;
  }
  for (const [source, status] of history) {
    requireValue(
      bySource.get(source).status === status,
      `${source}: status disagrees with history`
    );
  }
  if (previous) {
    requireValue(
      census.startedAt === previous.startedAt,
      'Keep original observation window'
    );
    requireValue(
      JSON.stringify(
        census.transitions.slice(0, previous.transitions.length)
      ) === JSON.stringify(previous.transitions),
      'Transition history is append-only'
    );
    for (const old of expandCensus(previous)) {
      const row = bySource.get(old.source);
      requireValue(
        row || !pages.includes(old.source),
        `${old.source}: cannot hide an existing surface in exclusions`
      );
      if (!row) continue; // A deleted route is retired, not silently reclassified.
      requireValue(
        row.weight === old.weight,
        `${row.source}: keep baseline work weights`
      );
      requireValue(
        old.status !== 'canonical' || row.status === 'canonical',
        `${row.source}: canonical regression`
      );
      requireValue(
        old.status === 'holdout' || row.status !== 'holdout',
        `${row.source}: new holdout on existing surface`
      );
      if (old.status !== row.status) {
        const events = census.transitions
          .slice(previous.transitions.length)
          .filter(event => event.source === row.source);
        requireValue(
          events[0]?.from === old.status && events.at(-1)?.to === row.status,
          `${row.source}: status change needs transition evidence`
        );
      }
    }
    const oldSources = new Set(expandCensus(previous).map(row => row.source));
    for (const row of rows.filter(row => !oldSources.has(row.source))) {
      const first = census.transitions.find(
        event => event.source === row.source
      );
      requireValue(
        first?.from === null,
        `${row.source}: declare new surface with an introduction event`
      );
    }
  }
  return rows;
}

export function summarizeCensus(census, now = Date.now()) {
  const rows = expandCensus(census);
  const counts = Object.fromEntries(
    STATUSES.map(status => [
      status,
      rows.filter(row => row.status === status).length,
    ])
  );
  const bySource = new Map(rows.map(row => [row.source, row]));
  const recent = days =>
    census.transitions.filter(event => {
      const age = now - Date.parse(event.at);
      return age >= 0 && age < days * DAY;
    });
  const window = days => {
    const events = recent(days);
    const completions = events.filter(event => event.to === 'canonical');
    return {
      canonicalized: completions.length,
      completedWeight: completions.reduce(
        (sum, event) => sum + bySource.get(event.source).weight,
        0
      ),
      regressions: events.filter(event => event.from === 'canonical').length,
      introducedHoldouts: events.filter(
        event => event.from === null && event.to === 'holdout'
      ).length,
    };
  };
  const remainingWeight = rows
    .filter(row => ['holdout', 'migrating'].includes(row.status))
    .reduce((sum, row) => sum + row.weight, 0);
  const rolling24h = window(1);
  const rolling7d = window(7);
  const elapsedDays = Math.min(7, (now - Date.parse(census.startedAt)) / DAY);
  const enoughData =
    elapsedDays >= 1 &&
    rolling7d.canonicalized >= 3 &&
    rolling7d.regressions === 0;
  const days = enoughData
    ? remainingWeight / (rolling7d.completedWeight / elapsedDays)
    : null;
  return {
    asOf: new Date(now).toISOString(),
    total: rows.length,
    counts,
    canonicalPercent: rows.length
      ? Math.round((counts.canonical / rows.length) * 1000) / 10
      : 0,
    excludedFixtures: census.excluded.sources.length,
    remainingWeight,
    rolling24h,
    rolling7d,
    eta:
      days === null
        ? {
            reason:
              'Insufficient observations: need >=3 completions over >=24h and no 7d regressions.',
          }
        : {
            days,
            rangeDays: [days / 1.5, days / 0.5],
            assumption:
              'Sensitivity range at 0.5–1.5x observed weighted velocity; not a confidence interval.',
          },
  };
}

export function checkCensus(root = process.cwd(), baseRef = 'origin/main') {
  const census = JSON.parse(readFileSync(join(root, CENSUS_PATH), 'utf8'));
  const git = args =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  // An absent file on the base is the initial census, not a Git/auth failure.
  const previous = git([
    'ls-tree',
    '--name-only',
    baseRef,
    '--',
    CENSUS_PATH,
  ]).trim()
    ? JSON.parse(git(['show', `${baseRef}:${CENSUS_PATH}`]))
    : null;
  const rows = validateCensus(census, discoverPages(root), previous);
  for (const row of rows) {
    for (const owner of row.expectedOwners) {
      requireValue(
        existsSync(join(root, owner)),
        `${row.source}: missing canonical owner ${owner}`
      );
    }
    if (row.status === 'canonical') {
      const stale = staleFiles(root, row);
      requireValue(
        stale.length === 0,
        `${row.source}: source changed; renew certification evidence ` +
          `(${stale.map(item => item.file).join(', ')}). After checking the rendered surface, run: ` +
          'node scripts/surface-recertify.mjs renew --ref "<what changed and how you verified it>"'
      );
    }
  }
  // Evidence for a file that is no longer certified would look current forever.
  const certified = new Map();
  for (const row of rows) {
    if (row.status !== 'canonical') continue;
    const files = certified.get(row.id) ?? new Set();
    for (const file of certifiedFiles(row)) files.add(file);
    certified.set(row.id, files);
  }
  const evidenceRoot = join(root, EVIDENCE_DIR);
  for (const groupId of existsSync(evidenceRoot)
    ? readdirSync(evidenceRoot).sort()
    : []) {
    for (const file of readEvidence(root, groupId).keys()) {
      requireValue(
        certified.get(groupId)?.has(file),
        `${evidenceEntryPath(groupId, file)}: evidence for a file that is not certified; delete it`
      );
    }
  }
  return { census, rows, summary: summarizeCensus(census) };
}

if (process.argv[1] === import.meta.filename) {
  const result = checkCensus(
    process.cwd(),
    process.argv.slice(2).find(arg => !arg.startsWith('--')) || 'origin/main'
  );
  console.log(
    JSON.stringify(
      process.argv.includes('--rows') ? result : result.summary,
      null,
      2
    )
  );
}
