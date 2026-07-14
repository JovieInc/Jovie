import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  GENERATED_RUN_ROOTS,
  planCompletedRuns,
  validateApplyCandidates,
} from './generated-artifact-retention.mjs';

const repoRoot = path.resolve('.');
const retentionScript = path.join(
  repoRoot,
  'scripts/generated-artifact-retention.mjs'
);
const cleanupScript = path.join(repoRoot, 'scripts/codex-cleanup.sh');
const loopOrchestratorScript = path.join(
  repoRoot,
  'scripts/loop-orchestrator.sh'
);
const profileRoots = [
  {
    completionMarker: 'summary.json',
    completionValue: JSON.stringify({ passed: true }),
    failedValue: JSON.stringify({ passed: false }),
    relativeRoot: '.context/profile-mock-diff',
  },
  {
    completionMarker: 'summary.json',
    completionValue: '{}',
    relativeRoot: '.context/profile-review-matrix',
  },
  {
    completionMarker: 'complete.json',
    completionValue: '{}',
    relativeRoot: '.context/profile-audit',
  },
];
const qaRunRoots = [
  {
    completionMarker: 'findings-ledger.json',
    relativeRoot: 'apps/web/test-results/route-qa',
  },
  {
    completionMarker: 'summary.json',
    relativeRoot: 'apps/web/test-results/public-route-qa',
  },
];

function createFixture() {
  return mkdtempSync(path.join(tmpdir(), 'jovie-artifact-retention-'));
}

function runRetention(root, mode) {
  return spawnSync(
    process.execPath,
    [retentionScript, mode, '--repo-root', root],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    }
  );
}

function reportNames(root) {
  return readdirSync(path.join(root, '.tech-debt')).filter(name =>
    name.startsWith('paydown-report-')
  );
}

function writeReport(root, day) {
  const name = `paydown-report-202607${String(day).padStart(2, '0')}-010000.md`;
  writeFileSync(path.join(root, '.tech-debt', name), `report ${day}`);
  return name;
}

function createCycle(root, relativeRoot, name, ageHours, content = 'artifact') {
  const cycle = path.join(root, relativeRoot, name);
  mkdirSync(cycle, { recursive: true });
  writeFileSync(path.join(cycle, 'artifact.txt'), content);
  const modified = new Date(Date.now() - ageHours * 60 * 60 * 1000);
  utimesSync(path.join(cycle, 'artifact.txt'), modified, modified);
  utimesSync(cycle, modified, modified);
  return cycle;
}

function markCycle(cycle, marker, value, ageHours) {
  const markerPath = path.join(cycle, marker);
  mkdirSync(path.dirname(markerPath), { recursive: true });
  writeFileSync(markerPath, value);
  const modified = new Date(Date.now() - ageHours * 60 * 60 * 1000);
  utimesSync(markerPath, modified, modified);
  let directory = path.dirname(markerPath);
  while (directory.startsWith(`${cycle}${path.sep}`)) {
    utimesSync(directory, modified, modified);
    directory = path.dirname(directory);
  }
  utimesSync(cycle, modified, modified);
}

test('keeps the newest 14 debt reports and preserves unrelated debt artifacts', () => {
  const root = createFixture();
  try {
    mkdirSync(path.join(root, '.tech-debt'), { recursive: true });
    const reports = Array.from({ length: 16 }, (_, index) =>
      writeReport(root, index + 1)
    );
    writeFileSync(path.join(root, '.tech-debt', 'scan-results.json'), '{}');
    writeFileSync(path.join(root, 'TECH_DEBT_REGISTRY.md'), 'registry');
    writeFileSync(
      path.join(root, '.tech-debt', 'paydown-report-invalid.md'),
      'invalid'
    );
    symlinkSync(
      path.join(root, '.tech-debt', reports[0]),
      path.join(root, '.tech-debt', 'paydown-report-20250101-010000.md')
    );

    const dryRun = runRetention(root, '--dry-run');
    assert.equal(dryRun.status, 0, dryRun.stderr);
    assert.equal(reportNames(root).length, 18);
    assert.match(dryRun.stdout, /eligible=16 retained=14 would-remove=2/);

    const apply = runRetention(root, '--apply');
    assert.equal(apply.status, 0, apply.stderr);
    assert.deepEqual(
      reportNames(root).sort(),
      [
        ...reports.slice(2),
        'paydown-report-20250101-010000.md',
        'paydown-report-invalid.md',
      ].sort()
    );
    assert.equal(
      readFileSync(path.join(root, '.tech-debt', 'scan-results.json'), 'utf8'),
      '{}'
    );
    assert.equal(
      readFileSync(path.join(root, 'TECH_DEBT_REGISTRY.md'), 'utf8'),
      'registry'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('bounds old profile cycles while preserving current, young, invalid, and symlinked paths', () => {
  const root = createFixture();
  const outside = mkdtempSync(path.join(tmpdir(), 'jovie-retention-outside-'));
  try {
    for (const profileRoot of profileRoots) {
      const { completionMarker, completionValue, relativeRoot } = profileRoot;
      mkdirSync(path.join(root, relativeRoot), { recursive: true });
      for (const [name, ageHours] of [
        ['old-1', 120],
        ['old-2', 96],
        ['old-3', 72],
        ['old-4', 48],
      ]) {
        const cycle = createCycle(root, relativeRoot, name, ageHours);
        markCycle(cycle, completionMarker, completionValue, ageHours);
      }
      createCycle(root, relativeRoot, 'young', 1);
      createCycle(root, relativeRoot, 'current', 240);
      createCycle(root, relativeRoot, 'latest', 240);
      createCycle(root, relativeRoot, '!invalid', 240);
      createCycle(root, relativeRoot, 'stale-incomplete', 240);
      createCycle(root, relativeRoot, 'recent-incomplete', 48);
      if (profileRoot.failedValue) {
        for (const [name, ageHours] of [
          ['failed-1', 120],
          ['failed-2', 96],
          ['failed-3', 72],
          ['failed-4', 48],
          ['failed-5', 25],
          ['failed-young', 1],
        ]) {
          const failed = createCycle(root, relativeRoot, name, ageHours);
          markCycle(
            failed,
            completionMarker,
            profileRoot.failedValue,
            ageHours
          );
        }
      }
      const nestedSymlink = createCycle(
        root,
        relativeRoot,
        'contains-symlink',
        240
      );
      symlinkSync(outside, path.join(nestedSymlink, 'outside-link'));
      symlinkSync(outside, path.join(root, relativeRoot, 'cycle-link'));
    }

    const apply = runRetention(root, '--apply');
    assert.equal(apply.status, 0, apply.stderr);
    for (const profileRoot of profileRoots) {
      const { relativeRoot } = profileRoot;
      assert.equal(existsSync(path.join(root, relativeRoot, 'old-1')), false);
      assert.equal(existsSync(path.join(root, relativeRoot, 'old-2')), false);
      assert.equal(
        existsSync(path.join(root, relativeRoot, 'stale-incomplete')),
        false
      );
      for (const name of [
        'old-3',
        'old-4',
        'young',
        'current',
        'latest',
        '!invalid',
        'recent-incomplete',
        'contains-symlink',
        'cycle-link',
      ]) {
        assert.ok(existsSync(path.join(root, relativeRoot, name)), name);
      }
      if (profileRoot.failedValue) {
        assert.equal(
          existsSync(path.join(root, relativeRoot, 'failed-1')),
          false
        );
        assert.equal(
          existsSync(path.join(root, relativeRoot, 'failed-2')),
          false
        );
        for (const name of [
          'failed-3',
          'failed-4',
          'failed-5',
          'failed-young',
        ]) {
          assert.ok(existsSync(path.join(root, relativeRoot, name)), name);
        }
      }
    }
    assert.ok(existsSync(outside));
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('preserves an artifact root that is itself a symlink outside the repo', () => {
  const root = createFixture();
  const outside = mkdtempSync(path.join(tmpdir(), 'jovie-retention-outside-'));
  try {
    mkdirSync(path.join(root, '.context'), { recursive: true });
    const outsideCycle = createCycle(outside, '.', 'old-cycle', 240);
    symlinkSync(outside, path.join(root, '.context', 'profile-audit'));

    const apply = runRetention(root, '--apply');
    assert.equal(apply.status, 0, apply.stderr);
    assert.ok(existsSync(outsideCycle));
    assert.match(apply.stderr, /not a real directory/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('bounds completed old QA runs while preserving active and unsafe siblings', () => {
  const root = createFixture();
  const outside = mkdtempSync(
    path.join(tmpdir(), 'jovie-qa-retention-outside-')
  );
  try {
    writeFileSync(path.join(outside, 'sentinel.txt'), 'keep');
    for (const { completionMarker, relativeRoot } of qaRunRoots) {
      mkdirSync(path.join(root, relativeRoot), { recursive: true });
      for (const [name, ageHours] of [
        ['old-1', 120],
        ['old-2', 96],
        ['old-3', 72],
        ['old-4', 48],
        ['young', 1],
        ['current', 240],
        ['latest', 240],
        ['!invalid', 240],
      ]) {
        const run = createCycle(root, relativeRoot, name, ageHours);
        writeFileSync(path.join(run, completionMarker), '{}');
        const modified = new Date(Date.now() - ageHours * 60 * 60 * 1000);
        utimesSync(path.join(run, completionMarker), modified, modified);
        utimesSync(run, modified, modified);
      }
      createCycle(root, relativeRoot, 'stale-incomplete', 240);
      createCycle(root, relativeRoot, 'recent-incomplete', 48);
      const nestedSymlink = createCycle(
        root,
        relativeRoot,
        'contains-symlink',
        240
      );
      writeFileSync(path.join(nestedSymlink, completionMarker), '{}');
      symlinkSync(outside, path.join(nestedSymlink, 'outside-link'));
      symlinkSync(outside, path.join(root, relativeRoot, 'run-link'));
    }

    const apply = runRetention(root, '--apply');
    assert.equal(apply.status, 0, apply.stderr);
    for (const { relativeRoot } of qaRunRoots) {
      assert.equal(existsSync(path.join(root, relativeRoot, 'old-1')), false);
      assert.equal(existsSync(path.join(root, relativeRoot, 'old-2')), false);
      assert.equal(
        existsSync(path.join(root, relativeRoot, 'stale-incomplete')),
        false
      );
      for (const name of [
        'old-3',
        'old-4',
        'young',
        'current',
        'latest',
        '!invalid',
        'recent-incomplete',
        'contains-symlink',
        'run-link',
      ]) {
        assert.ok(existsSync(path.join(root, relativeRoot, name)), name);
      }
    }
    assert.equal(
      readFileSync(path.join(outside, 'sentinel.txt'), 'utf8'),
      'keep'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('bounds every timestamped perf, overnight, QA swarm, and releases history producer', () => {
  const root = createFixture();
  try {
    const createCompletedSeries = ({
      completionMarker,
      completionValue = '{}',
      count,
      namePrefix,
      relativeRoot,
    }) => {
      const names = [];
      for (let index = 1; index <= count; index += 1) {
        const name = `${namePrefix}${index}`;
        const ageHours = 24 + (count - index + 1) * 24;
        const cycle = createCycle(root, relativeRoot, name, ageHours);
        markCycle(cycle, completionMarker, completionValue, ageHours);
        names.push(name);
      }
      return names;
    };

    for (const prefix of ['homepage-', 'dashboard-', 'route-']) {
      createCompletedSeries({
        completionMarker: 'state.json',
        completionValue: JSON.stringify({ status: 'threshold-hit' }),
        count: 5,
        namePrefix: prefix,
        relativeRoot: '.context/perf',
      });
    }
    createCompletedSeries({
      completionMarker: 'launch-perf-summary.json',
      completionValue: JSON.stringify({ status: 'pass' }),
      count: 5,
      namePrefix: 'launch-check-',
      relativeRoot: '.context/perf',
    });
    createCompletedSeries({
      completionMarker: 'state.json',
      completionValue: JSON.stringify({ status: 'completed' }),
      count: 5,
      namePrefix: 'end-user-',
      relativeRoot: '.context/perf',
    });
    writeFileSync(
      path.join(root, '.context/perf/homepage-current.json'),
      JSON.stringify({
        artifactDir: realpathSync(path.join(root, '.context/perf/homepage-1')),
      })
    );
    for (const [name, ageHours] of [
      ['homepage-abandoned-running', 240],
      ['homepage-young-running', 48],
    ]) {
      const cycle = createCycle(root, '.context/perf', name, ageHours);
      markCycle(
        cycle,
        'state.json',
        JSON.stringify({ status: 'running' }),
        ageHours
      );
    }

    const overnightNames = createCompletedSeries({
      completionMarker: 'reports/sweep-summary.json',
      count: 16,
      namePrefix: 'overnight-',
      relativeRoot: '.context/overnight-qa/runs',
    });
    writeFileSync(
      path.join(root, '.context/overnight-qa/state.json'),
      JSON.stringify({
        activeRunDir: realpathSync(
          path.join(root, '.context/overnight-qa/runs', overnightNames[0])
        ),
      })
    );

    createCompletedSeries({
      completionMarker: 'summary.json',
      count: 16,
      namePrefix: 'qa-swarm-',
      relativeRoot: '.context/qa-swarm/runs',
    });
    createCompletedSeries({
      completionMarker: 'summary.md',
      count: 5,
      namePrefix: 'release-',
      relativeRoot: '.context/qa/releases-dashboard/history',
    });
    createCycle(
      root,
      '.context/qa-swarm/runs',
      'qa-swarm-stale-incomplete',
      240
    );
    createCycle(
      root,
      '.context/qa-swarm/runs',
      'qa-swarm-recent-incomplete',
      48
    );

    const dryRun = runRetention(root, '--dry-run');
    assert.equal(dryRun.status, 0, dryRun.stderr);
    assert.match(dryRun.stdout, /Would remove \.context\/perf\/dashboard-1/);
    assert.ok(existsSync(path.join(root, '.context/perf/dashboard-1')));

    const apply = runRetention(root, '--apply');
    assert.equal(apply.status, 0, apply.stderr);
    assert.ok(existsSync(path.join(root, '.context/perf/homepage-1')));
    assert.equal(
      existsSync(path.join(root, '.context/perf/homepage-2')),
      false
    );
    assert.equal(
      existsSync(path.join(root, '.context/perf/homepage-abandoned-running')),
      false
    );
    assert.ok(
      existsSync(path.join(root, '.context/perf/homepage-young-running'))
    );
    for (const prefix of [
      'dashboard-',
      'route-',
      'launch-check-',
      'end-user-',
    ]) {
      assert.equal(
        existsSync(path.join(root, `.context/perf/${prefix}1`)),
        false,
        prefix
      );
      assert.equal(
        existsSync(path.join(root, `.context/perf/${prefix}2`)),
        false,
        prefix
      );
      assert.ok(existsSync(path.join(root, `.context/perf/${prefix}3`)));
    }
    assert.ok(
      existsSync(path.join(root, '.context/overnight-qa/runs/overnight-1'))
    );
    assert.equal(
      existsSync(path.join(root, '.context/overnight-qa/runs/overnight-2')),
      false,
      `${apply.stdout}\n${apply.stderr}`
    );
    assert.equal(
      existsSync(path.join(root, '.context/qa-swarm/runs/qa-swarm-1')),
      false
    );
    assert.equal(
      existsSync(path.join(root, '.context/qa-swarm/runs/qa-swarm-2')),
      false
    );
    assert.equal(
      existsSync(
        path.join(root, '.context/qa-swarm/runs/qa-swarm-stale-incomplete')
      ),
      false
    );
    assert.ok(
      existsSync(
        path.join(root, '.context/qa-swarm/runs/qa-swarm-recent-incomplete')
      )
    );
    assert.equal(
      existsSync(
        path.join(root, '.context/qa/releases-dashboard/history/release-1')
      ),
      false
    );
    assert.ok(
      existsSync(
        path.join(root, '.context/qa/releases-dashboard/history/release-3')
      )
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('apply revalidates current pointers and completion state before deletion', async () => {
  const root = createFixture();
  try {
    const config = GENERATED_RUN_ROOTS.find(
      candidate => candidate.namePrefix === 'homepage-'
    );
    assert.ok(config);
    const perfRoot = path.join(root, '.context/perf');
    mkdirSync(perfRoot, { recursive: true });
    for (let index = 1; index <= 4; index += 1) {
      const ageHours = 48 + (4 - index) * 24;
      const cycle = createCycle(
        root,
        '.context/perf',
        `homepage-${index}`,
        ageHours
      );
      markCycle(
        cycle,
        'state.json',
        JSON.stringify({ status: 'threshold-hit' }),
        ageHours
      );
    }
    createCycle(root, '.context/perf', 'homepage-stale', 240);

    const plan = await planCompletedRuns(
      realpathSync(root),
      config,
      Date.now()
    );
    assert.equal(plan.candidates.length, 2);
    const completedCandidate = plan.candidates.find(
      candidate => candidate.name === 'homepage-1'
    );
    const incompleteCandidate = plan.candidates.find(
      candidate => candidate.name === 'homepage-stale'
    );
    assert.ok(completedCandidate);
    assert.ok(incompleteCandidate);
    writeFileSync(
      path.join(perfRoot, 'homepage-current.json'),
      JSON.stringify({ artifactDir: completedCandidate.path })
    );
    await assert.rejects(
      validateApplyCandidates(plan.candidates, Date.now()),
      /Refusing current run/
    );

    rmSync(path.join(perfRoot, 'homepage-current.json'));
    markCycle(
      completedCandidate.path,
      'state.json',
      JSON.stringify({ status: 'running' }),
      240
    );
    await assert.rejects(
      validateApplyCandidates(plan.candidates, Date.now()),
      /Refusing changed run state/
    );

    markCycle(
      incompleteCandidate.path,
      'state.json',
      JSON.stringify({ status: 'stalled' }),
      240
    );
    await assert.rejects(
      validateApplyCandidates([incompleteCandidate], Date.now()),
      /Refusing changed run state/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('codex cleanup forwards dry-run and apply modes to artifact retention', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'jovie-cleanup-retention-'));
  try {
    mkdirSync(path.join(root, '.tech-debt'), { recursive: true });
    for (let day = 1; day <= 15; day += 1) writeReport(root, day);
    const env = {
      ...process.env,
      CODEX_CLEANUP_SKIP_GBRAIN: '1',
      JOVIE_CLEANUP_REPO_ROOT: root,
      JOVIE_CLEANUP_TEST_MODE: '1',
    };

    const dryRun = spawnSync('bash', [cleanupScript, '--dry-run'], {
      cwd: repoRoot,
      encoding: 'utf8',
      env,
    });
    assert.equal(dryRun.status, 0, dryRun.stderr);
    assert.equal(reportNames(root).length, 15);
    assert.match(dryRun.stdout, /Generated artifact retention \(dry-run\)/);

    const apply = spawnSync('bash', [cleanupScript, '--apply'], {
      cwd: repoRoot,
      encoding: 'utf8',
      env,
    });
    assert.equal(apply.status, 0, apply.stderr);
    assert.equal(reportNames(root).length, 14);
    assert.match(apply.stdout, /Generated artifact retention \(apply\)/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('loop logs rotate atomically to two bounded generations', () => {
  const fixtureRoot = realpathSync(
    mkdtempSync(path.join(tmpdir(), 'jovie-loop-logs-'))
  );
  const root = path.join(fixtureRoot, 'loop-logs');
  try {
    const script = [
      `source ${JSON.stringify(loopOrchestratorScript)}`,
      'ensure_log_root',
      `printf '12345678901234567890' > "$LOG/test.log"`,
      'rotate_log_if_needed test.log',
      `printf 'abcdefghijklmno' > "$LOG/test.log"`,
      'rotate_log_if_needed test.log',
    ].join('\n');
    const result = spawnSync('bash', ['-c', script], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        LOOP_LOG_MAX_BYTES: '10',
        LOOP_LOG_ROOT: root,
        LOOP_LOG_TEST_MODE: '1',
        LOOP_LOG_TEST_ROOT: fixtureRoot,
      },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(statSync(path.join(root, 'test.log')).size, 0);
    assert.equal(statSync(path.join(root, 'test.log.1')).size, 10);
    assert.equal(statSync(path.join(root, 'test.log.2')).size, 10);
    assert.equal(existsSync(path.join(root, 'test.log.3')), false);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('run_logged stays bounded while a verbose child is still active', () => {
  const fixtureRoot = realpathSync(
    mkdtempSync(path.join(tmpdir(), 'jovie-loop-logs-'))
  );
  const root = path.join(fixtureRoot, 'loop-logs');
  try {
    const script = [
      `source ${JSON.stringify(loopOrchestratorScript)}`,
      'ensure_log_root',
      "verbose_child() { for _ in 1 2 3 4 5 6; do head -c 8192 /dev/zero | tr '\\0' x; sleep 0.05; done; }",
      'run_logged live.log verbose_child &',
      'run_pid=$!',
      'while kill -0 "$run_pid" 2>/dev/null; do',
      '  if [[ -f "$LOG/live.log" ]] && (( $(wc -c < "$LOG/live.log") > LOOP_LOG_MAX_BYTES )); then exit 91; fi',
      '  sleep 0.01',
      'done',
      'wait "$run_pid"',
      '(( $(wc -c < "$LOG/live.log") <= LOOP_LOG_MAX_BYTES ))',
      'set +e',
      "run_logged exit.log bash -c 'printf failed; exit 23'",
      'exit_status=$?',
      'set -e',
      '[[ "$exit_status" == "23" ]]',
    ].join('\n');
    const result = spawnSync('bash', ['-c', script], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        LOOP_LOG_MAX_BYTES: '1024',
        LOOP_LOG_ROOT: root,
        LOOP_LOG_TEST_MODE: '1',
        LOOP_LOG_TEST_ROOT: fixtureRoot,
      },
    });
    assert.equal(result.status, 0, result.stderr);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('loop log rotation rejects symlink escapes without touching external files', () => {
  const fixtureRoot = realpathSync(
    mkdtempSync(path.join(tmpdir(), 'jovie-loop-logs-'))
  );
  const externalRoot = realpathSync(
    mkdtempSync(path.join(tmpdir(), 'jovie-loop-external-'))
  );
  const sentinel = path.join(externalRoot, 'sentinel.log');
  writeFileSync(sentinel, 'external-sentinel');

  const runGuard = (logRoot, command = 'ensure_log_root') =>
    spawnSync(
      'bash',
      ['-c', `source ${JSON.stringify(loopOrchestratorScript)}\n${command}`],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          LOOP_LOG_MAX_BYTES: '10',
          LOOP_LOG_ROOT: logRoot,
          LOOP_LOG_TEST_MODE: '1',
          LOOP_LOG_TEST_ROOT: fixtureRoot,
        },
      }
    );

  try {
    const productionOverride = spawnSync(
      'bash',
      [
        '-c',
        `source ${JSON.stringify(loopOrchestratorScript)}\nensure_log_root`,
      ],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          LOOP_LOG_ROOT: path.join(externalRoot, 'loop-logs'),
        },
      }
    );
    assert.notEqual(productionOverride.status, 0);

    symlinkSync(externalRoot, path.join(fixtureRoot, 'live-parent'));
    const liveAncestor = runGuard(
      path.join(fixtureRoot, 'live-parent', 'loop-logs')
    );
    assert.notEqual(liveAncestor.status, 0);

    symlinkSync(
      path.join(externalRoot, 'missing'),
      path.join(fixtureRoot, 'dangling-parent')
    );
    const danglingAncestor = runGuard(
      path.join(fixtureRoot, 'dangling-parent', 'loop-logs')
    );
    assert.notEqual(danglingAncestor.status, 0);

    const targetParent = path.join(fixtureRoot, 'target-parent');
    mkdirSync(targetParent);
    symlinkSync(externalRoot, path.join(targetParent, 'loop-logs'));
    const liveTarget = runGuard(path.join(targetParent, 'loop-logs'));
    assert.notEqual(liveTarget.status, 0);

    const danglingTargetParent = path.join(
      fixtureRoot,
      'dangling-target-parent'
    );
    mkdirSync(danglingTargetParent);
    symlinkSync(
      path.join(externalRoot, 'missing'),
      path.join(danglingTargetParent, 'loop-logs')
    );
    const danglingTarget = runGuard(
      path.join(danglingTargetParent, 'loop-logs')
    );
    assert.notEqual(danglingTarget.status, 0);

    const fileRoot = path.join(fixtureRoot, 'safe', 'loop-logs');
    mkdirSync(fileRoot, { recursive: true });
    symlinkSync(sentinel, path.join(fileRoot, 'test.log'));
    const fileTarget = runGuard(fileRoot, 'rotate_log_if_needed test.log');
    assert.notEqual(fileTarget.status, 0);
    assert.equal(readFileSync(sentinel, 'utf8'), 'external-sentinel');

    const raceRoot = path.join(fixtureRoot, 'race', 'loop-logs');
    mkdirSync(raceRoot, { recursive: true });
    writeFileSync(path.join(raceRoot, 'test.log'), '12345678901234567890');
    const raceScript = [
      `source ${JSON.stringify(loopOrchestratorScript)}`,
      'tail() { command tail "$@"; ln -s "$EXTERNAL_SENTINEL" "$LOG/test.log.2"; }',
      'rotate_log_if_needed test.log',
    ].join('\n');
    const revalidationFailure = spawnSync('bash', ['-c', raceScript], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        EXTERNAL_SENTINEL: sentinel,
        LOOP_LOG_MAX_BYTES: '10',
        LOOP_LOG_ROOT: raceRoot,
        LOOP_LOG_TEST_MODE: '1',
        LOOP_LOG_TEST_ROOT: fixtureRoot,
      },
    });
    assert.notEqual(revalidationFailure.status, 0);
    assert.deepEqual(
      readdirSync(raceRoot).filter(name => name.includes('.rotate.')),
      []
    );
    assert.equal(readFileSync(sentinel, 'utf8'), 'external-sentinel');
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
    rmSync(externalRoot, { recursive: true, force: true });
  }
});
