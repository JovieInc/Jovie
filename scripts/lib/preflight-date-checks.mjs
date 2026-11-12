#!/usr/bin/env node
/**
 * Date checks for `pnpm preflight:changed`, run before push instead of in PR
 * CI. Two kinds of change turned main red for every merge group on
 * 2026-11-08 to 11-10 (serialization audit, finding 5):
 *
 * - time bombs: a test that compares a fixed date to the real clock
 *   (production-release-supersession.test.mjs, fixed by #24822);
 * - surface-census renewal: a certified surface's source changed without a
 *   renewed evidence entry ("pricing/page.tsx: source changed", #24853).
 *
 *   node scripts/lib/preflight-date-checks.mjs census --base <ref> [-- <changed paths>]
 *   node scripts/lib/preflight-date-checks.mjs time-bomb [--days 7] [-- <changed paths>]
 *
 * Both judge only what the diff touches, so a date effect already on main
 * does not block unrelated pushes; the daily week-ahead scan in
 * remediation-sweep.yml covers tests nobody touched.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const CENSUS_INPUT =
  /^apps\/web\/(?:app\/|components\/|data\/designSystem\/surfaceCensus)|^scripts\/(?:design-surface-census|surface-recertify|lib\/surface-recertify)/;
const CENSUS_OWN =
  /^apps\/web\/data\/designSystem\/surfaceCensus|^apps\/web\/app\/.*\/page\.[jt]sx?$/;
const WEB_UNIT_TEST =
  /^apps\/web\/(?!tests\/(?:e2e|playwright|product-screenshots|visual-qa)\/)(.+\.test\.[cm]?[jt]sx?)$/;
const SCRIPT_TEST = /^scripts\/.+\.test\.mjs$/;
const TIME_BOMB_INPUT = /^(?:apps\/web\/|scripts\/)/;
const MAX_AFFECTED_SCRIPT_TESTS = 12;

const quote = value => `'${String(value).replaceAll("'", "'\\''")}'`;

/** Preflight checks for the changed paths: [{ id, name, command }]. */
export function dateChecks(paths, baseRef) {
  const checks = [];
  const census = paths.filter(p => CENSUS_INPUT.test(p));
  if (census.length)
    checks.push({
      id: 'date:surface-census',
      name: 'surface census evidence for changed certified files',
      command: `node scripts/lib/preflight-date-checks.mjs census --base ${quote(baseRef)} -- ${census.map(quote).join(' ')}`,
    });
  const bombs = paths.filter(p => TIME_BOMB_INPUT.test(p));
  if (bombs.length)
    checks.push({
      id: 'date:time-bomb',
      name: 'time bombs in changed and affected tests (clock +7 days)',
      command: `node scripts/lib/preflight-date-checks.mjs time-bomb -- ${bombs.map(quote).join(' ')}`,
    });
  return checks;
}

/**
 * Census problems this diff causes or can fix. A stale certified file counts
 * only when the diff touches it; census-wide validation counts only when the
 * diff touches the census or adds/removes a page. Returns { errors, notes }.
 */
export function censusFindings(
  changed,
  {
    root = ROOT,
    baseRef,
    census,
    readCurrent = () =>
      JSON.parse(readFileSync(join(root, census.CENSUS_PATH), 'utf8')),
    readPrevious = () => {
      const git = args =>
        execFileSync('git', args, { cwd: root, encoding: 'utf8' });
      // An absent file on the base is the initial census.
      return git([
        'ls-tree',
        '--name-only',
        baseRef,
        '--',
        census.CENSUS_PATH,
      ]).trim()
        ? JSON.parse(git(['show', `${baseRef}:${census.CENSUS_PATH}`]))
        : null;
    },
  }
) {
  const touched = new Set(changed);
  const errors = [];
  const notes = [];
  const current = readCurrent();
  const previous = readPrevious();
  let rows;
  try {
    rows = census.validateCensus(current, census.discoverPages(root), previous);
  } catch (error) {
    (changed.some(p => CENSUS_OWN.test(p)) ? errors : notes).push(
      `surface census: ${error.message}`
    );
    return { errors, notes };
  }
  for (const row of rows) {
    if (row.status !== 'canonical') continue;
    const stale = census
      .staleFiles(root, row)
      .map(item => item.file)
      .filter(file => touched.has(file));
    if (stale.length)
      errors.push(
        `${row.source}: source changed; renew certification evidence (${stale.join(', ')}). ` +
          'After checking the rendered surface, run: node scripts/surface-recertify.mjs renew --ref "<what changed and how you verified it>"'
      );
  }
  return { errors, notes };
}

/** Changed web unit tests, relative to apps/web, for the Vitest scan. */
export function webTimeBombTargets(changed) {
  return changed.flatMap(p => p.match(WEB_UNIT_TEST)?.[1] ?? []).sort();
}

/** Script contract tests the diff changes or whose imports/reads it touches. */
export function scriptTimeBombTargets(changed, { contracts, affected }) {
  const listed = new Set(contracts);
  const direct = changed.filter(p => SCRIPT_TEST.test(p) && listed.has(p));
  const reached = affected(contracts, changed);
  // A diff to a widely read file reaches most contracts; the daily scan
  // covers those, so a local push runs only the ones it edits.
  const extra = reached.length > MAX_AFFECTED_SCRIPT_TESTS ? [] : reached;
  return [...new Set([...direct, ...extra])].sort();
}

function scanWeb(files, days) {
  if (!files.length) return [];
  const dir = mkdtempSync(join(tmpdir(), 'preflight-time-bomb-'));
  const out = join(dir, 'findings.json');
  try {
    const run = spawnSync(
      'node',
      [
        'scripts/time-bomb/scan.mjs',
        'run',
        '--suite',
        'web',
        '--days',
        String(days),
        '--out',
        out,
        '--',
        '--passWithNoTests',
        ...files,
      ],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }
    );
    if (run.status !== 0) throw new Error('the shifted web scan failed to run');
    return JSON.parse(readFileSync(out, 'utf8')).findings ?? [];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function scanScripts(changed, days) {
  const [{ SCRIPT_CONTRACT_NODE_TESTS }, { testsAffectedBy }, scan] =
    await Promise.all(
      [
        'scripts/ci-fast-lanes.mjs',
        'scripts/lib/test-file-dependencies.mjs',
        'scripts/time-bomb/scan.mjs',
      ].map(file => import(pathToFileURL(join(ROOT, file)).href))
    );
  const files = scriptTimeBombTargets(changed, {
    contracts: SCRIPT_CONTRACT_NODE_TESTS,
    affected: (tests, paths) => testsAffectedBy(tests, paths, ROOT),
  });
  const passes = (file, shiftDays) =>
    spawnSync('node', ['--test', file], {
      cwd: ROOT,
      env: scan.shiftedEnv(shiftDays),
      stdio: 'ignore',
      timeout: 600_000,
    }).status === 0;
  const failing = files.filter(file => !passes(file, days));
  return scan.confirmTimeBombs(failing, { days, passes });
}

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  const split = rest.indexOf('--');
  const flags = split === -1 ? rest : rest.slice(0, split);
  const paths = split === -1 ? [] : rest.slice(split + 1);
  const value = name => {
    const index = flags.indexOf(name);
    return index === -1 ? undefined : flags[index + 1];
  };
  if (!['census', 'time-bomb'].includes(command))
    throw new Error(
      'usage: preflight-date-checks.mjs census|time-bomb [flags] -- <paths>'
    );
  const days = Number(value('--days') ?? 7);
  if (!Number.isInteger(days) || days < 1)
    throw new Error('--days must be a whole number of days');
  return { command, base: value('--base') ?? 'origin/main', days, paths };
}

async function main(argv) {
  const options = parseArgs(argv);
  if (options.command === 'census') {
    const census = await import(
      pathToFileURL(join(ROOT, 'scripts/design-surface-census.mjs')).href
    );
    const { errors, notes } = censusFindings(options.paths, {
      baseRef: options.base,
      census,
    });
    for (const note of notes)
      console.log(`note (not caused by this diff): ${note}`);
    for (const error of errors) console.error(error);
    if (!errors.length)
      console.log(
        'surface census: changed certified files have current evidence'
      );
    return errors.length ? 1 : 0;
  }
  const findings = [
    ...scanWeb(webTimeBombTargets(options.paths), options.days),
    ...(await scanScripts(options.paths, options.days)),
  ];
  for (const finding of findings)
    console.error(
      `time bomb: ${finding.file} passes today and fails with the clock ${finding.breaksInDays} day(s) ahead; pin its clock (vi.setSystemTime, an injected now, or tests/utils/calendar-deadline-clock.ts)`
    );
  if (!findings.length)
    console.log('time bombs: none in changed or affected tests');
  return findings.length ? 1 : 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main(process.argv.slice(2)).then(
    code => {
      process.exitCode = code;
    },
    error => {
      console.error(
        `preflight-date-checks: ${error instanceof Error ? error.message : error}`
      );
      process.exitCode = 1;
    }
  );
}
