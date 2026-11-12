import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as yamlLoad } from 'js-yaml';
import { test } from 'vitest';
import {
  CENSUS_PATH,
  checkCensus,
  evidenceEntryPath,
  fileDigest,
} from '../../design-surface-census.mjs';
import { evaluateFleetRules } from '../../pr-fleet-rules.mjs';
import {
  evidenceEntries,
  renewGroup,
  requiresAuth,
  routePath,
  staleGroups,
  validateCapture,
} from '../surface-recertify.mjs';
import { parseWinSection } from '../wins-ledger.mjs';

const PAGE = 'apps/web/app/(marketing)/pricing/page.tsx';
const OWNER = 'apps/web/components/site/MarketingFooter.tsx';

function repo(pageSources = [PAGE]) {
  const root = mkdtempSync(join(tmpdir(), 'recertify-'));
  for (const file of [...pageSources, OWNER]) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), `content of ${file}`);
  }
  const group = {
    id: 'pricing',
    area: 'marketing',
    importance: { acquisition: 3, revenue: 3, usage: 3 },
    status: 'canonical',
    expectedOwners: [OWNER],
    evidence: {
      kind: 'certification',
      at: '2026-10-01T00:00:00Z',
      ref: 'old evidence',
    },
    sources: pageSources,
  };
  const census = { groups: [group] };
  for (const file of [...pageSources, OWNER]) certify(root, file);
  return { root, census, group };
}
function write(root, entries) {
  for (const { path, entry } of entries) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), `${JSON.stringify(entry, null, 2)}\n`);
  }
}
function certify(root, file, ref = 'old evidence for this file') {
  write(root, [
    {
      path: evidenceEntryPath('pricing', file),
      entry: {
        file,
        sha256: fileDigest(root, file),
        at: '2026-10-01T00:00:00Z',
        ref,
      },
    },
  ]);
}
const shot = width => ({
  width,
  status: 200,
  finalPath: '/pricing',
  sha256: 'a'.repeat(64),
  bytes: 90_000,
  scrollWidth: width,
  clientWidth: width,
  pageErrors: [],
});
const capture = {
  id: 'pricing',
  route: '/pricing',
  shots: [shot(1440), shot(390)],
};

test('a certified surface with unchanged bytes is not stale', () => {
  const { root, census } = repo();
  assert.deepEqual(staleGroups(root, census), []);
});

test('changing an owner file makes exactly that file stale, with its new digest', () => {
  const { root, census } = repo();
  writeFileSync(join(root, OWNER), 'edited');
  const [stale] = staleGroups(root, census);
  assert.equal(stale.id, 'pricing');
  assert.equal(stale.route, '/pricing');
  assert.equal(stale.recertifiable, true);
  assert.deepEqual(stale.files, [
    { file: OWNER, sha256: fileDigest(root, OWNER) },
  ]);
});

test('dynamic routes and multi-source groups are never recertified blindly', () => {
  const dynamic = repo(['apps/web/app/(marketing)/[slug]/page.tsx']);
  writeFileSync(join(dynamic.root, OWNER), 'edited');
  assert.equal(
    staleGroups(dynamic.root, dynamic.census)[0].recertifiable,
    false
  );
  const multi = repo([PAGE, 'apps/web/app/(marketing)/pricing/other/page.tsx']);
  writeFileSync(join(multi.root, OWNER), 'edited');
  assert.equal(staleGroups(multi.root, multi.census)[0].recertifiable, false);
});

test('capture must prove a real render at 1440 and 390', () => {
  const { root, census } = repo();
  writeFileSync(join(root, OWNER), 'edited');
  const [group] = staleGroups(root, census);
  validateCapture(capture, group);
  assert.throws(
    () => validateCapture({ ...capture, shots: [shot(1440)] }, group),
    /missing 390px/
  );
  assert.throws(
    () =>
      validateCapture(
        { ...capture, shots: [shot(1440), { ...shot(390), status: 500 }] },
        group
      ),
    /HTTP 500/
  );
  assert.throws(
    () =>
      validateCapture(
        {
          ...capture,
          shots: [{ ...shot(1440), scrollWidth: 1500 }, shot(390)],
        },
        group
      ),
    /horizontal overflow/
  );
  assert.throws(
    () => validateCapture({ ...capture, route: '/x' }, group),
    /route mismatch/
  );
});

test('a signed-out redirect or failed test sign-in never renews a surface', () => {
  const { root, census } = repo();
  writeFileSync(join(root, OWNER), 'edited');
  const [group] = staleGroups(root, census);
  // /app/* without a session answers 200 on /signin: that must not certify.
  assert.throws(
    () =>
      validateCapture(
        {
          ...capture,
          shots: [shot(1440), { ...shot(390), finalPath: '/signin' }],
        },
        group
      ),
    /390px redirected to \/signin/
  );
  assert.throws(
    () =>
      validateCapture(
        { ...capture, shots: [{ ...shot(1440), authStatus: 500 }, shot(390)] },
        group
      ),
    /1440px test sign-in HTTP 500/
  );
  const { finalPath: _omit, ...legacy } = shot(1440);
  assert.throws(
    () => validateCapture({ ...capture, shots: [legacy, shot(390)] }, group),
    /1440px final path not recorded/
  );
  validateCapture(
    { ...capture, shots: [{ ...shot(1440), authStatus: 200 }, shot(390)] },
    group
  );
});

test('route helpers normalise paths and flag app routes for sign-in', () => {
  assert.equal(routePath('/pricing/'), '/pricing');
  assert.equal(routePath('/'), '/');
  assert.equal(routePath('/app/contacts?tab=audience'), '/app/contacts');
  assert.equal(requiresAuth('/app'), true);
  assert.equal(requiresAuth('/app/contacts'), true);
  assert.equal(requiresAuth('/apple'), false);
  assert.equal(requiresAuth('/pricing'), false);
});

test('renewal writes the real digest and evidence pointers for the stale file only', () => {
  const { root, census } = repo();
  writeFileSync(join(root, OWNER), 'edited');
  const [group] = staleGroups(root, census);
  const entries = renewGroup(group, {
    capture,
    at: '2026-10-29T20:00:00.000Z',
    runUrl: 'https://github.com/JovieInc/Jovie/actions/runs/1',
    artifactName: 'surface-recert-1',
    sha: 'abcdef1234567890',
  });
  assert.deepEqual(
    entries.map(item => item.path),
    [evidenceEntryPath('pricing', OWNER)]
  );
  const [{ entry }] = entries;
  assert.equal(entry.sha256, fileDigest(root, OWNER));
  assert.equal(entry.at, '2026-10-29T20:00:00.000Z');
  assert.match(entry.ref, /abcdef123/);
  assert.match(entry.ref, /surface-recert-1/);
  assert.match(entry.ref, /1440px sha256 a{64}/);
  write(root, entries);
  assert.deepEqual(staleGroups(root, census), []);
  // The untouched page keeps its own, older evidence.
  assert.equal(
    JSON.parse(
      readFileSync(join(root, evidenceEntryPath('pricing', PAGE)), 'utf8')
    ).ref,
    'old evidence for this file'
  );
});

test('a renewal must say what changed; a bare hash is not evidence', () => {
  const { root, census } = repo();
  writeFileSync(join(root, OWNER), 'edited');
  const [group] = staleGroups(root, census);
  assert.throws(
    () => evidenceEntries(group, { at: '2026-10-29T20:00:00.000Z', ref: 'ok' }),
    /what changed and how it was verified/
  );
  assert.throws(
    () =>
      evidenceEntries(group, {
        at: '2026-10-29T20:00:00.000Z',
        ref: undefined,
      }),
    /what changed and how it was verified/
  );
});

test('renewal CLI and bot PR body report the measured win required by Fleet', () => {
  const { root, census } = repo();
  writeFileSync(join(root, OWNER), 'edited');
  const censusFile = join(root, CENSUS_PATH);
  mkdirSync(dirname(censusFile), { recursive: true });
  writeFileSync(censusFile, JSON.stringify(census));
  const evidence = join(root, 'evidence');
  mkdirSync(join(evidence, 'pricing'), { recursive: true });
  writeFileSync(
    join(evidence, 'pricing/capture.json'),
    JSON.stringify(capture)
  );
  const cli = fileURLToPath(
    new URL('../../surface-recertify.mjs', import.meta.url)
  );
  const invoke = args =>
    JSON.parse(
      execFileSync(process.execPath, [cli, ...args, '--root', root], {
        encoding: 'utf8',
      })
    );
  const before = invoke(['list']);
  const runUrl = 'https://github.com/JovieInc/Jovie/actions/runs/123';
  const applied = invoke([
    'apply',
    '--evidence',
    evidence,
    '--run-url',
    runUrl,
    '--artifact',
    'surface-recert-123',
    '--sha',
    'a'.repeat(40),
  ]);
  const after = invoke(['list']);
  assert.equal(before.length, 1);
  assert.deepEqual(applied, { renewed: ['pricing'], failed: [], skipped: [] });
  assert.deepEqual(after, []);

  const workflow =
    /** @type {{ jobs: { recertify: { steps: { name?: string, run?: string }[] } } }} */ (
      yamlLoad(
        readFileSync(
          new URL(
            '../../../.github/workflows/surface-recertify.yml',
            import.meta.url
          ),
          'utf8'
        )
      )
    );
  const step = workflow.jobs.recertify.steps.find(
    item => item.name === 'Open or update the renewal PR'
  );
  const heredoc = step.run.match(
    /cat > "\$RUNNER_TEMP\/body.md" <<BODY\n([\s\S]*?)\nBODY/
  );
  assert(heredoc, 'the bot publishes a reviewable PR body');
  execFileSync(
    'bash',
    ['-eu', '-c', `cat > "$RUNNER_TEMP/body.md" <<BODY\n${heredoc[1]}\nBODY\n`],
    {
      env: {
        ...process.env,
        RUNNER_TEMP: root,
        GITHUB_SHA: 'a'.repeat(40),
        GITHUB_RUN_ID: '123',
        renewed: applied.renewed.join(', '),
        renewed_count: String(applied.renewed.length),
        remaining_count: String(after.length),
        run_url: runUrl,
      },
    }
  );
  const body = readFileSync(join(root, 'body.md'), 'utf8');
  assert.deepEqual(
    evaluateFleetRules({
      pr: {
        title: 'chore(design): renew certification evidence',
        labels: ['compounding'],
        body,
      },
      files: [{ filename: evidenceEntryPath('pricing', OWNER) }],
    }),
    { errors: [], warnings: [] }
  );
  const win = parseWinSection(body);
  assert.equal(win.metrics[0].before, 1);
  assert.equal(win.metrics[0].after, 0);
  assert.equal(win.verifyLink, runUrl);
});

// Two individually green PRs must stay green when a merge group combines
// them. With one digest per row this failed 30 merge groups in a week
// (2026-11-04..11): each PR renewed the row against its own base, so the
// combined bytes matched neither digest, and both had rewritten the same line.
test('two PRs that each renew their own certified file combine green; an unrenewed change stays red', () => {
  const HEADER = 'apps/web/components/site/MarketingHeader.tsx';
  const root = mkdtempSync(join(tmpdir(), 'census-combine-'));
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_SYSTEM: '/dev/null',
        GIT_AUTHOR_NAME: 't',
        GIT_AUTHOR_EMAIL: 't@example.com',
        GIT_COMMITTER_NAME: 't',
        GIT_COMMITTER_EMAIL: 't@example.com',
      },
    });
  const cli = fileURLToPath(
    new URL('../../surface-recertify.mjs', import.meta.url)
  );
  const renew = ref =>
    execFileSync(process.execPath, [
      cli,
      'renew',
      '--ref',
      ref,
      '--root',
      root,
    ]);
  git('init', '-q', '-b', 'main');
  for (const file of [PAGE, OWNER, HEADER]) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), `content of ${file}\n`);
  }
  mkdirSync(dirname(join(root, CENSUS_PATH)), { recursive: true });
  writeFileSync(
    join(root, CENSUS_PATH),
    JSON.stringify({
      schema: 'jovie.design-surface-census/v1',
      startedAt: '2026-10-15T04:36:00Z',
      groups: [
        {
          id: 'pricing',
          area: 'marketing',
          owner: '@itstimwhite',
          issue: 'JOV-8097',
          importance: { acquisition: 3, revenue: 3, usage: 3 },
          status: 'canonical',
          expectedOwners: [OWNER, HEADER],
          remainingScope: 'Certified',
          divergence: 'None',
          evidence: {
            kind: 'certification',
            at: '2026-10-21T04:36:00Z',
            ref: 'exact-build-render',
          },
          sources: [PAGE],
        },
      ],
      excluded: { reason: 'Internal fixtures', sources: [] },
      transitions: [],
    })
  );
  renew('Initial certification of the pricing fixture surface.');
  git('add', '.');
  git('commit', '-q', '-m', 'seed');
  checkCensus(root, 'main');

  const branch = (name, file, renewed) => {
    git('checkout', '-q', '-b', name, 'main');
    writeFileSync(join(root, file), `${name} changed ${file}\n`);
    if (renewed)
      renew(`${name}: changed ${file}; rendered /pricing, no change.`);
    git('add', '.');
    git('commit', '-q', '-m', name);
  };

  branch('pr-footer', OWNER, true);
  checkCensus(root, 'main');
  assert.deepEqual(
    git('diff', '--name-only', 'main').trim().split('\n').sort(),
    [evidenceEntryPath('pricing', OWNER), OWNER].sort(),
    'a renewal touches only the entry of the file it changed'
  );
  branch('pr-header', HEADER, true);
  checkCensus(root, 'main');

  git('checkout', '-q', '-b', 'merge-group', 'main');
  git('merge', '-q', '--no-ff', '-m', 'footer', 'pr-footer');
  git('merge', '-q', '--no-ff', '-m', 'header', 'pr-header');
  assert.equal(git('status', '--porcelain'), '');
  checkCensus(root, 'main');
  assert.deepEqual(staleGroups(root), []);

  // Still a gate: certified bytes changed with no renewal fail, alone and
  // when combined behind a PR that did renew.
  branch('pr-unrenewed', PAGE, false);
  assert.throws(
    () => checkCensus(root, 'main'),
    /pricing\/page\.tsx: source changed; renew certification evidence \(apps\/web\/app\/\(marketing\)\/pricing\/page\.tsx\)/
  );
  git('checkout', '-q', 'merge-group');
  git('merge', '-q', '--no-ff', '-m', 'unrenewed', 'pr-unrenewed');
  assert.throws(() => checkCensus(root, 'main'), /source changed/);

  // Evidence left behind for a file that is no longer certified also fails.
  git('checkout', '-q', '-b', 'orphan', 'main');
  const census = JSON.parse(readFileSync(join(root, CENSUS_PATH), 'utf8'));
  census.groups[0].expectedOwners = [OWNER];
  writeFileSync(join(root, CENSUS_PATH), JSON.stringify(census));
  assert.throws(
    () => checkCensus(root, 'main'),
    /MarketingHeader\.tsx\.json: evidence for a file that is not certified/
  );
});
