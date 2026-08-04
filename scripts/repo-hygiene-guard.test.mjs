import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  closeSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  rmSync,
  statSync,
  symlinkSync,
  truncateSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import {
  classifyRolloutFindings,
  evaluateRepoHygiene,
  HYGIENE_EXCEPTION_MAX_DAYS,
  HYGIENE_LIMITS,
  REPO_HEALTH_BASELINE,
  REPO_HEALTH_CANDIDATE_LIMITS,
  REPO_HEALTH_ROLLOUT,
  RETIRED_TRACKED_FILE_CEILING,
  validateHygieneExceptions,
  validateRepoHealthBaselineChange,
  validateRepoHealthRollout,
} from './repo-hygiene-guard.mjs';

const cleanupScript = resolve('scripts/codex-cleanup.sh');

function promotedRollout(mode) {
  return {
    ...REPO_HEALTH_ROLLOUT,
    mode,
    promotionApproval: {
      approvedBy: '@repo-owner',
      approvedOn: '2026-08-20',
      issue: 'JOV-9999',
    },
    evidence: {
      ...REPO_HEALTH_ROLLOUT.evidence,
      actionableOwnershipRate: 1,
      deltaBlockingRuns: 20,
      deltaBlockingStartedOn: '2026-08-05',
      falsePositiveRate: 0.01,
      legacyFindingCount: 0,
      p95RuntimeMs: 200,
      representativePullRequests: 20,
      shadowRuns: 20,
    },
  };
}

function fixtureFile(root, path, bytes = 1) {
  const absolute = join(root, path);
  mkdirSync(dirname(absolute), { recursive: true });
  const fd = openSync(absolute, 'w');
  closeSync(fd);
  if (bytes > 0) writeFileSync(absolute, Buffer.alloc(Math.min(bytes, 1024)));
  if (bytes > 1024) truncateSync(absolute, bytes);
  return absolute;
}

test('blocks recursive, runtime, generated, root screenshot, temp, and unapproved binary additions', () => {
  const root = mkdtempSync(join(tmpdir(), 'jovie-hygiene-'));
  try {
    for (const path of [
      '.kandan/project/project/file.txt',
      '.tech-debt/paydown-report.md',
      'apps/web/apps/web/generated.json',
      '.context/profile-mock-diff/cycle/diff.png',
      '.context/profile-review-matrix/review.json',
      '.context/profile-audit/cycle/screenshot.png',
      '.context/profile-mobile-qa/cycle/screenshot.png',
      '.context/public-profile-layout-approval/cycle/screenshot.png',
      '.context/outputs/yc-demo/video.webm',
      '.context/perf/end-user-run/state.json',
      '.context/overnight-qa/runs/run-1/events.jsonl',
      '.context/qa-swarm/runs/qa-swarm-run/summary.json',
      '.context/qa/releases-dashboard/history/run/summary.md',
      '.context/loop-logs/orchestrator.log',
      'apps/web/audit-screenshots/signin.png',
      'apps/web/.issues/sonar-issues-latest.json',
      'scripts/node_modules/.vite/vitest/results.json',
      'TECH_DEBT_REGISTRY.md',
      'preview.png',
      'src/capture.tmp-123',
      'random/media/photo.jpg',
    ]) {
      fixtureFile(root, path);
    }
    const { errors } = evaluateRepoHygiene({
      addedPaths: [
        '.kandan/project/project/file.txt',
        '.tech-debt/paydown-report.md',
        'apps/web/apps/web/generated.json',
        '.context/profile-mock-diff/cycle/diff.png',
        '.context/profile-review-matrix/review.json',
        '.context/profile-audit/cycle/screenshot.png',
        '.context/profile-mobile-qa/cycle/screenshot.png',
        '.context/public-profile-layout-approval/cycle/screenshot.png',
        '.context/outputs/yc-demo/video.webm',
        '.context/perf/end-user-run/state.json',
        '.context/overnight-qa/runs/run-1/events.jsonl',
        '.context/qa-swarm/runs/qa-swarm-run/summary.json',
        '.context/qa/releases-dashboard/history/run/summary.md',
        '.context/loop-logs/orchestrator.log',
        'apps/web/audit-screenshots/signin.png',
        'apps/web/.issues/sonar-issues-latest.json',
        'scripts/node_modules/.vite/vitest/results.json',
        'TECH_DEBT_REGISTRY.md',
        'preview.png',
        'src/capture.tmp-123',
        'random/media/photo.jpg',
      ],
      root,
    });
    assert.match(
      errors.join('\n'),
      /repeated adjacent path component\/sequence/
    );
    assert.match(errors.join('\n'), /runtime root directory/);
    assert.equal(
      errors.filter(error => error.includes('generated output path')).length,
      15
    );
    assert.match(errors.join('\n'), /repository root/);
    assert.match(errors.join('\n'), /temporary\/backup/);
    assert.match(errors.join('\n'), /outside the allowlisted asset paths/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('blocks every ignored generated output even when presented as an added path', () => {
  for (const path of [
    '.tech-debt/paydown-report.md',
    'TECH_DEBT_REGISTRY.md',
    '.context/profile-mock-diff/cycle/diff.html',
    '.context/profile-review-matrix/cycle/matrix.json',
    '.context/profile-audit/cycle/screenshot.png',
    '.context/profile-mobile-qa/cycle/screenshot.png',
    '.context/public-profile-layout-approval/cycle/screenshot.png',
    '.context/outputs/yc-demo/video.webm',
    '.context/perf/end-user-run/state.json',
    '.context/overnight-qa/runs/run-1/events.jsonl',
    '.context/qa-swarm/runs/qa-swarm-run/summary.json',
    '.context/qa/releases-dashboard/history/run/summary.md',
    '.context/loop-logs/orchestrator.log',
    'apps/web/audit-screenshots/signin.png',
    'apps/web/.issues/sonar-issues-latest.json',
    'agentos/runs/design-lab/dispatches/design-lab-id.json',
    'agentos/runs/design-taste/run-1/manifest.json',
    'agentos/runs/design-taste-jury/run-1/manifest.json',
    'scripts/node_modules/.vite/vitest/results.json',
  ]) {
    const { errors } = evaluateRepoHygiene({ addedPaths: [path] });
    assert.ok(errors.length > 0, `${path} should be blocked`);
  }
});

test('blocks force-added build, test, coverage, and cache roots derived from gitignore', () => {
  const forceAddedGeneratedPaths = [
    'apps/web/.next/server/app.js',
    'apps/docs/.next/server/app.js',
    '.turbo/cache/root.bin',
    'packages/ui/.turbo/cache/nested.bin',
    'apps/web/test-results/results.json',
    'packages/ui/test-results/results.json',
    'apps/web/artifacts/trace.zip',
    'agentos/runs/run-1/artifacts/result.json',
    'playwright-report/index.html',
    'apps/web/playwright-report/index.html',
    'coverage/lcov.info',
    'apps/web/coverage/lcov.info',
    'packages/other/coverage/lcov.info',
    '.cache/compiler/state.json',
    'packages/ui/.cache/compiler/state.json',
    '.bt/cache.json',
    '.vercel/project.json',
    'apps/web/.workflow-data/world.json',
    'build/bundle.js',
    '.build/bundle.js',
    'out/export.html',
    'apps/desktop/dist/main.js',
    'apps/desktop/dist-electron/main.js',
    'apps/web/.swc/cache.bin',
    'apps/web/storybook-static/index.html',
    '.claude/worktrees/local/index',
    '.claude/projects/local/index',
    '.claude/teams/local/index',
    '.claude/tasks/local/index',
    '.codex/session/runtime.json',
    '.worktrees/local/index',
    '.issues/local.json',
    '.gbrain-source',
    '.hermes/runtime/state.json',
    '.audit/report.json',
    '.gstack/browser/state.json',
    '.claude-flow/state.db',
    '.swarm/state.db',
    'logs/security/audit.log',
    'output/generated.json',
    '.DS_Store',
    'apps/web/.eslintcache',
    'apps/web/tsconfig.tsbuildinfo',
    'apps/web/vitest.junit.xml',
  ];

  for (const path of forceAddedGeneratedPaths) {
    assert.match(
      evaluateRepoHygiene({ addedPaths: [path] }).errors.join('\n'),
      /(?:generated output path is not tracked|runtime root directory is not tracked)/,
      path
    );
  }

  for (const sourcePath of [
    'packages/compiler/dist/index.ts',
    'packages/renderer/output/index.ts',
    'apps/web/lib/submission-agent/artifacts/attachment-validation.ts',
    'apps/web/app/build/page.tsx',
    '.agents/skills/example/SKILL.md',
    'apps/desktop/src/window-state.ts',
    'agentos/manifests/canonical.json',
    '.codex/config.toml',
    '.codex/hooks.json',
    '.codex/local-env.toml',
  ]) {
    assert.deepEqual(
      evaluateRepoHygiene({ addedPaths: [sourcePath] }).errors,
      [],
      sourcePath
    );
  }
});

test('allows the App Router app route but blocks repeated multi-segment paths', () => {
  assert.deepEqual(
    evaluateRepoHygiene({
      addedPaths: ['apps/web/app/app/[...slug]/page.tsx'],
    }).errors,
    []
  );
  assert.match(
    evaluateRepoHygiene({
      addedPaths: ['apps/web/apps/web/generated.json'],
    }).errors.join('\n'),
    /repeated adjacent path component\/sequence/
  );
});

test('allows canonical assets and enforces binary byte budgets', () => {
  const root = mkdtempSync(join(tmpdir(), 'jovie-hygiene-budget-'));
  try {
    const allowed = 'apps/web/public/product-screenshots/new.png';
    fixtureFile(root, allowed);
    assert.deepEqual(
      evaluateRepoHygiene({ addedPaths: [allowed], root }).errors,
      []
    );

    const oversized = 'apps/web/public/video/oversized.mp4';
    const absolute = fixtureFile(root, oversized);
    truncateSync(absolute, HYGIENE_LIMITS.maxBinaryBytes + 1);
    assert.match(
      evaluateRepoHygiene({ addedPaths: [oversized], root }).errors.join('\n'),
      /per-file binary budget/
    );

    const aggregatePaths = Array.from(
      { length: 7 },
      (_, index) => `apps/web/public/product-screenshots/aggregate-${index}.png`
    );
    for (const path of aggregatePaths) {
      const file = fixtureFile(root, path);
      truncateSync(file, 9 * 1024 * 1024);
    }
    assert.match(
      evaluateRepoHygiene({ addedPaths: aggregatePaths, root }).errors.join(
        '\n'
      ),
      /aggregate budget/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('allows only canonical __snapshots__ test binaries', () => {
  const canonical =
    'apps/web/tests/e2e/__snapshots__/visual.spec.ts/homepage.png';
  assert.deepEqual(evaluateRepoHygiene({ addedPaths: [canonical] }).errors, []);

  const legacy =
    'apps/web/tests/e2e/visual.spec.ts-snapshots/homepage-chromium.png';
  assert.match(
    evaluateRepoHygiene({ addedPaths: [legacy] }).errors.join('\n'),
    /outside the allowlisted asset paths/
  );
});

test('enforces per-file and aggregate budgets for every regular file type', () => {
  const root = mkdtempSync(join(tmpdir(), 'jovie-hygiene-all-files-'));
  try {
    for (const path of [
      'fixtures/oversized.json',
      'fixtures/oversized.bin',
      'fixtures/oversized.webm',
      'fixtures/extensionless',
    ]) {
      const file = fixtureFile(root, path);
      truncateSync(file, HYGIENE_LIMITS.maxFileBytes + 1);
      assert.match(
        evaluateRepoHygiene({
          changedPaths: [path],
          addedPaths: [],
          root,
        }).errors.join('\n'),
        /per-file budget/,
        path
      );
    }

    const aggregatePaths = Array.from(
      { length: 7 },
      (_, index) => `fixtures/aggregate-${index}.json`
    );
    for (const path of aggregatePaths) {
      const file = fixtureFile(root, path);
      truncateSync(file, 9 * 1024 * 1024);
    }
    assert.match(
      evaluateRepoHygiene({
        changedPaths: aggregatePaths,
        addedPaths: [],
        root,
      }).errors.join('\n'),
      /across changed files.*aggregate budget/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('enforces canonical visual baseline count and byte budgets', () => {
  const root = mkdtempSync(join(tmpdir(), 'jovie-hygiene-snapshots-'));
  try {
    const snapshotRoot = 'apps/web/tests/e2e/__snapshots__/visual.spec.ts';
    for (let index = 0; index <= HYGIENE_LIMITS.maxSnapshotFiles; index += 1) {
      fixtureFile(root, `${snapshotRoot}/baseline-${index}.png`);
    }
    assert.match(
      evaluateRepoHygiene({ addedPaths: [], root }).errors.join('\n'),
      /canonical visual-test baselines.*file budget/
    );

    rmSync(resolve(root, 'apps/web/tests/e2e/__snapshots__'), {
      recursive: true,
      force: true,
    });
    for (let index = 0; index < 2; index += 1) {
      const file = fixtureFile(root, `${snapshotRoot}/large-${index}.png`);
      truncateSync(file, 7 * 1024 * 1024);
    }
    assert.match(
      evaluateRepoHygiene({ addedPaths: [], root }).errors.join('\n'),
      /canonical visual-test baselines.*budget/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('reports measured repository and per-area growth findings in shadow mode', () => {
  const webPaths = Array.from(
    {
      length:
        REPO_HEALTH_CANDIDATE_LIMITS.maxNetTrackedFilesByArea['apps/web'] + 1,
    },
    (_, index) => `apps/web/lib/new-module-${index}.ts`
  );
  const webResult = evaluateRepoHygiene({ addedPaths: webPaths });
  assert.deepEqual(webResult.errors, []);
  assert.match(
    webResult.advisories.join('\n'),
    /apps\/web net \+16 regular files exceed the candidate \+15 ceiling/
  );

  const broadPaths = Array.from(
    { length: REPO_HEALTH_CANDIDATE_LIMITS.maxNetTrackedFiles + 1 },
    (_, index) => `area-${index}/source.ts`
  );
  const broadResult = evaluateRepoHygiene({ addedPaths: broadPaths });
  assert.deepEqual(broadResult.errors, []);
  assert.match(
    broadResult.advisories.join('\n'),
    /net \+21 regular files exceed the candidate \+20 repository ceiling/
  );

  const scriptsAdded = Array.from(
    { length: 8 },
    (_, index) => `scripts/new-${index}.mjs`
  );
  const scriptsDeleted = Array.from(
    { length: 4 },
    (_, index) => `scripts/retired-${index}.mjs`
  );
  const offsetResult = evaluateRepoHygiene({
    addedPaths: scriptsAdded,
    deletedPaths: scriptsDeleted,
  });
  assert.equal(offsetResult.netTrackedFiles, 4);
  assert.deepEqual(offsetResult.errors, []);
  assert.deepEqual(offsetResult.areaGrowth, [
    { added: 8, area: 'scripts', deleted: 4, net: 4 },
  ]);
});

test('keeps tighter binary churn advisory until rollout promotion', () => {
  const root = mkdtempSync(join(tmpdir(), 'jovie-hygiene-binary-shadow-'));
  try {
    const paths = Array.from(
      { length: 25 },
      (_, index) => `apps/web/public/product-screenshots/shadow-${index}.png`
    );
    for (const path of paths) fixtureFile(root, path);
    const shadow = evaluateRepoHygiene({
      addedPaths: paths,
      addedRegularPaths: [],
      root,
    });
    assert.deepEqual(shadow.errors, []);
    assert.match(shadow.advisories.join('\n'), /binary-churn: 25 files/);

    const promoted = evaluateRepoHygiene({
      addedPaths: paths,
      addedRegularPaths: [],
      rollout: promotedRollout('delta-blocking'),
      root,
    });
    assert.match(promoted.errors.join('\n'), /binary-churn: 25 files/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('applies only scoped, owned, issue-linked, unexpired exceptions', () => {
  const paths = Array.from(
    { length: REPO_HEALTH_CANDIDATE_LIMITS.maxNetTrackedFiles + 1 },
    (_, index) => `apps/web/lib/large-slice-${index}.ts`
  );
  const exception = {
    id: 'large-owned-slice',
    owner: '@repo-owner',
    issue: 'JOV-9999',
    headRef: 'codex/large-owned-slice',
    createdOn: '2026-08-01',
    expiresOn: '2026-08-30',
    reason: 'Measured one-time package consolidation with owned replacement.',
    pathPrefixes: ['apps/web/lib/'],
    limits: {
      maxNetTrackedFiles: 25,
      maxNetTrackedFilesByArea: { 'apps/web': 25 },
    },
  };

  const shadow = evaluateRepoHygiene({
    addedPaths: paths,
    exceptions: [exception],
    headRef: exception.headRef,
    now: new Date('2026-08-15T00:00:00Z'),
  });
  assert.deepEqual(shadow.errors, []);
  assert.deepEqual(shadow.appliedExceptions, []);
  assert.match(shadow.advisories.join('\n'), /regular-file-growth/);

  const allowed = evaluateRepoHygiene({
    addedPaths: paths,
    exceptions: [exception],
    headRef: exception.headRef,
    now: new Date('2026-08-15T00:00:00Z'),
    rollout: promotedRollout('delta-blocking'),
  });
  assert.deepEqual(allowed.errors, []);
  assert.deepEqual(allowed.appliedExceptions, [exception.id]);

  const wrongBranch = evaluateRepoHygiene({
    addedPaths: paths,
    exceptions: [exception],
    headRef: 'codex/unrelated',
    now: new Date('2026-08-15T00:00:00Z'),
    rollout: promotedRollout('delta-blocking'),
  });
  assert.match(wrongBranch.errors.join('\n'), /regular-file-growth/);

  const expired = validateHygieneExceptions(
    [exception],
    new Date('2026-09-01T00:00:00Z')
  );
  assert.match(expired.join('\n'), /expired on 2026-08-30/);

  const overlong = {
    ...exception,
    id: 'overlong-slice',
    expiresOn: '2026-09-01',
  };
  assert.match(
    validateHygieneExceptions(
      [overlong],
      new Date('2026-08-02T00:00:00Z')
    ).join('\n'),
    new RegExp(`at most ${HYGIENE_EXCEPTION_MAX_DAYS} days`)
  );

  const malformed = {
    ...exception,
    id: 'malformed-slice',
    reason: '',
    pathPrefixes: ['*'],
    limits: { maxNetTrackedFilesByArea: 25 },
  };
  assert.match(
    validateHygieneExceptions(
      [malformed],
      new Date('2026-08-02T00:00:00Z')
    ).join('\n'),
    /reason is invalid|pathPrefixes|must be an area map/
  );
});

test('grandfathers the exact file-count baseline while payload budgets stay blocking', () => {
  const root = mkdtempSync(join(tmpdir(), 'jovie-hygiene-repo-budget-'));
  try {
    const source = fixtureFile(root, 'fixtures/source.txt');
    const trackedPaths = ['fixtures/source.txt'];
    for (let index = 1; index <= RETIRED_TRACKED_FILE_CEILING; index += 1) {
      const path = `fixtures/file-${index}.txt`;
      linkSync(source, join(root, path));
      trackedPaths.push(path);
    }
    const trackedResult = evaluateRepoHygiene({
      addedPaths: [],
      root,
      trackedPaths,
    });
    assert.equal(
      trackedResult.trackedFilesTotal,
      RETIRED_TRACKED_FILE_CEILING + 1
    );
    assert.equal(trackedResult.trackedFiles, RETIRED_TRACKED_FILE_CEILING + 1);
    assert.deepEqual(trackedResult.errors, []);
    assert.match(
      trackedResult.advisories.join('\n'),
      /retired 10000-file ceiling is non-blocking/
    );

    const oversizedText = fixtureFile(root, 'payload/oversized.txt');
    truncateSync(oversizedText, HYGIENE_LIMITS.maxTrackedBytes + 1);
    assert.match(
      evaluateRepoHygiene({
        addedPaths: [],
        root,
        trackedPaths: ['payload/oversized.txt'],
      }).errors.join('\n'),
      /tracked regular files.*repository budget/
    );

    const oversizedBinary = fixtureFile(root, 'payload/oversized.png');
    truncateSync(oversizedBinary, HYGIENE_LIMITS.maxTrackedBinaryBytes + 1);
    assert.match(
      evaluateRepoHygiene({
        addedPaths: [],
        root,
        trackedPaths: ['payload/oversized.png'],
      }).errors.join('\n'),
      /tracked binaries.*repository budget/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('reports all regular files while preserving the legacy compatibility count', () => {
  const root = mkdtempSync(join(tmpdir(), 'jovie-hygiene-generated-count-'));
  try {
    const trackedPaths = [
      'source/plan-gate.mjs',
      'apps/web/lib/design/generated/design-tokens.ts',
      'apps/web/lib/design/generated/design-tokens.manifest.json',
      'apps/web/styles/generated/design-tokens.css',
      'apps/web/reports/nightly-agent/last-run.json',
      'apps/web/reports/test-coverage-snapshot.json',
      'apps/web/screenshot-catalog/current/manifest.json',
    ];
    for (const path of trackedPaths) fixtureFile(root, path);

    const result = evaluateRepoHygiene({
      addedPaths: [],
      root,
      trackedPaths,
    });
    assert.equal(result.errors.length, 0);
    assert.equal(result.trackedFiles, 1);
    assert.equal(result.trackedFilesTotal, trackedPaths.length);
    assert.equal(result.trackedBytes, trackedPaths.length);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('tracked payload skips missing paths and symlinks without following them', () => {
  const root = mkdtempSync(join(tmpdir(), 'jovie-hygiene-repo-links-'));
  try {
    const target = fixtureFile(root, 'outside/large.bin');
    truncateSync(target, HYGIENE_LIMITS.maxTrackedBytes + 1);
    const link = join(root, 'tracked/link.bin');
    mkdirSync(dirname(link), { recursive: true });
    symlinkSync(target, link);

    const result = evaluateRepoHygiene({
      addedPaths: [],
      root,
      trackedPaths: ['tracked/missing.bin', 'tracked/link.bin'],
    });
    assert.deepEqual(result.errors, []);
    assert.equal(result.trackedFiles, 0);
    assert.equal(result.trackedBytes, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('tracked payload inspection fails closed on filesystem errors', () => {
  const root = mkdtempSync(join(tmpdir(), 'jovie-hygiene-repo-error-'));
  try {
    const invalidPath = `tracked/${'x'.repeat(5_000)}`;
    assert.match(
      evaluateRepoHygiene({
        addedPaths: [],
        root,
        trackedPaths: [invalidPath],
      }).errors.join('\n'),
      /unable to inspect tracked path/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('keeps 800 legacy findings visible without blocking unrelated delta work', () => {
  const shadow = classifyRolloutFindings({
    baselineCount: 800,
    currentCount: 800,
    mode: 'shadow',
    ruleId: 'example-legacy-rule',
  });
  assert.deepEqual(shadow.errors, []);
  assert.match(shadow.advisories.join('\n'), /800 current findings/);

  const grandfathered = classifyRolloutFindings({
    baselineCount: 800,
    currentCount: 800,
    mode: 'delta-blocking',
    ruleId: 'example-legacy-rule',
  });
  assert.deepEqual(grandfathered.errors, []);
  assert.match(
    grandfathered.advisories.join('\n'),
    /grandfathered baseline 800/
  );

  const regression = classifyRolloutFindings({
    baselineCount: 800,
    currentCount: 801,
    mode: 'delta-blocking',
    ruleId: 'example-legacy-rule',
  });
  assert.match(regression.errors.join('\n'), /forbids baseline growth/);

  const full = classifyRolloutFindings({
    baselineCount: 800,
    currentCount: 800,
    mode: 'full-blocking',
    ruleId: 'example-legacy-rule',
  });
  assert.match(full.errors.join('\n'), /requires zero findings/);
});

test('requires measured evidence and explicit approval before promotion', () => {
  assert.deepEqual(validateRepoHealthRollout(REPO_HEALTH_ROLLOUT), []);
  assert.deepEqual(
    validateRepoHealthRollout(promotedRollout('delta-blocking')),
    []
  );
  assert.deepEqual(
    validateRepoHealthRollout(promotedRollout('full-blocking')),
    []
  );

  const premature = {
    ...promotedRollout('delta-blocking'),
    evidence: {
      ...promotedRollout('delta-blocking').evidence,
      representativePullRequests: 1,
    },
  };
  assert.match(
    validateRepoHealthRollout(premature).join('\n'),
    /representative pull requests/
  );
});

test('prevents silent baseline growth while allowing measured approved changes', () => {
  const increased = structuredClone(REPO_HEALTH_BASELINE);
  increased.repository.regularFiles += 1;
  increased.repository.legacyBudgetCountedRegularFiles += 1;
  assert.match(
    validateRepoHealthBaselineChange(REPO_HEALTH_BASELINE, increased).join(
      '\n'
    ),
    /cannot grow silently/
  );

  increased.baselineRevision += 1;
  increased.sourceSha = '1111111111111111111111111111111111111111';
  increased.changeApproval = {
    approvedBy: '@repo-owner',
    approvedOn: '2026-08-20',
    issue: 'JOV-9999',
    measurements: 'Exact-main checkout and trend receipt justify this update.',
    reason: 'Measured repository growth is healthy and owner-reviewed.',
  };
  assert.deepEqual(
    validateRepoHealthBaselineChange(REPO_HEALTH_BASELINE, increased),
    []
  );
});

function setupCleanupFixture() {
  const root = mkdtempSync(join(tmpdir(), 'jovie-cleanup-'));
  execFileSync('git', ['init', '-q', root]);
  for (const path of [
    'apps/web/.next/dev/cache/turbopack/cache.bin',
    'apps/web/.next/cache/turbopack/cache.bin',
    'apps/web/.next/cache/pack/cache.bin',
    '.turbo/cache/cache.bin',
  ]) {
    fixtureFile(root, path);
  }
  const packDir = join(root, '.git/objects/pack');
  mkdirSync(packDir, { recursive: true });
  const oldPack = fixtureFile(root, '.git/objects/pack/tmp_pack_old', 32);
  const youngPack = fixtureFile(root, '.git/objects/pack/tmp_pack_young', 32);
  const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
  utimesSync(oldPack, old, old);
  return { oldPack, root, youngPack };
}

function runCleanup(root, mode, extraEnv = {}) {
  return spawnSync('bash', [cleanupScript, mode], {
    cwd: resolve('.'),
    encoding: 'utf8',
    env: {
      ...process.env,
      CODEX_CLEANUP_SKIP_GBRAIN: '1',
      JOVIE_NEXT_CACHE_MAX_KIB: '0',
      JOVIE_TURBO_CACHE_MAX_KIB: '0',
      JOVIE_CLEANUP_REPO_ROOT: root,
      JOVIE_CLEANUP_TEST_MODE: '1',
      ...extraEnv,
    },
  });
}

test('cleanup dry-run preserves targets and apply removes only safe targets', () => {
  const { oldPack, root, youngPack } = setupCleanupFixture();
  try {
    const dryRun = runCleanup(root, '--dry-run');
    assert.equal(dryRun.status, 0, dryRun.stderr);
    assert.ok(existsSync(join(root, '.turbo/cache/cache.bin')));
    assert.ok(existsSync(oldPack));

    const apply = runCleanup(root, '--apply');
    assert.equal(apply.status, 0, apply.stderr);
    assert.equal(existsSync(join(root, '.turbo/cache')), false);
    assert.equal(
      existsSync(join(root, 'apps/web/.next/dev/cache/turbopack')),
      false
    );
    assert.equal(
      existsSync(join(root, 'apps/web/.next/cache/turbopack')),
      false
    );
    assert.equal(existsSync(join(root, 'apps/web/.next/cache/pack')), false);
    assert.equal(existsSync(oldPack), false);
    assert.ok(existsSync(youngPack));
    assert.equal(statSync(youngPack).size, 32);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('cleanup rejects repo-root overrides outside explicit test mode', () => {
  const { root } = setupCleanupFixture();
  try {
    const result = spawnSync('bash', [cleanupScript, '--dry-run'], {
      cwd: resolve('.'),
      encoding: 'utf8',
      env: {
        ...process.env,
        JOVIE_CLEANUP_REPO_ROOT: root,
      },
    });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /restricted to explicit test mode/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('cleanup preserves cache and Git data behind symlinked ancestors', () => {
  const { root } = setupCleanupFixture();
  const outside = mkdtempSync(join(tmpdir(), 'jovie-cleanup-outside-'));
  try {
    rmSync(join(root, 'apps/web/.next'), { recursive: true, force: true });
    rmSync(join(root, '.turbo'), { recursive: true, force: true });
    rmSync(join(root, '.git/objects/pack'), { recursive: true, force: true });

    const nextPayload = fixtureFile(
      outside,
      'next/dev/cache/turbopack/cache.bin',
      2048
    );
    const turboPayload = fixtureFile(outside, 'turbo/cache/cache.bin', 2048);
    const packPayload = fixtureFile(outside, 'pack/tmp_pack_external', 32);
    mkdirSync(join(root, 'apps/web'), { recursive: true });
    mkdirSync(join(root, '.git/objects'), { recursive: true });
    symlinkSync(join(outside, 'next'), join(root, 'apps/web/.next'));
    symlinkSync(join(outside, 'turbo'), join(root, '.turbo'));
    symlinkSync(join(outside, 'pack'), join(root, '.git/objects/pack'));

    const result = runCleanup(root, '--apply');
    assert.equal(result.status, 0, result.stderr);
    for (const payload of [nextPayload, turboPayload, packPayload]) {
      assert.ok(existsSync(payload), payload);
    }
    assert.match(result.stderr, /unsafe or symlinked cache path/);
    assert.match(result.stderr, /unsafe or symlinked pack directory/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('cleanup preserves aged Git temp packs when lsof is unavailable', () => {
  const { oldPack, root } = setupCleanupFixture();
  try {
    const result = runCleanup(root, '--apply', {
      JOVIE_CLEANUP_TEST_LSOF_UNAVAILABLE: '1',
      JOVIE_CLEANUP_TEST_REQUIRE_LSOF: '1',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(oldPack));
    assert.match(
      result.stderr,
      /lsof unavailable; ownership cannot be verified/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
