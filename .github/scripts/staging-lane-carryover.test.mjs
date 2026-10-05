import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { test } from 'node:test';
import { resolveStagingCarryover } from './staging-lane-carryover.mjs';

const base = 'ce07c2cdcf5e80bf2ed59389b8186e193937bda3';
const web = '44471ede008b34ac77de475a4b9bb4d4159bf9da';
const current = '59f3d5044a433c151caee3d8e935e4304f4c497f';
function fixture(paths = ['pnpm-lock.yaml', 'scripts/lanes/lane_runner.py']) {
  return {
    repository: 'JovieInc/Jovie',
    expectedSha: current,
    sourceCiRunId: '37356737863',
    currentReceipt: {
      provenance: { sha: current },
      releaseRouting: { sourceMainRunId: '37356737863' },
      aggregatePassed: true,
      selectedLanes: ['mac', 'operations'],
    },
    identity: {
      commitSha: base,
      deploymentId: 'dpl_exactStage',
      environment: 'preview',
    },
    collectRange: (from, to) => {
      assert.equal(from, base);
      assert.equal(to, current);
      return {
        cumulativeChangedPaths: paths,
        commitsNewestFirst: [
          {
            sha: current,
            firstParent: web,
            changedPaths: ['scripts/lanes/lane_runner.py'],
          },
          {
            sha: web,
            firstParent: base,
            changedPaths: paths.filter(
              p => p !== 'scripts/lanes/lane_runner.py'
            ),
          },
        ],
      };
    },
    resolveEvidence: input => {
      assert.deepEqual(input, {
        repository: 'JovieInc/Jovie',
        sha: web,
        lane: 'web',
      });
      return {
        ...input,
        event: 'merge_group',
        runId: 37354611740,
        artifactId: 101,
      };
    },
  };
}
test('replays merge-group-only Web followed by non-Web main: stage current main with historical exact admission', () => {
  const result = resolveStagingCarryover(fixture());
  assert.equal(result.outcome, 'proceed');
  assert.equal(result.stagingSha, base);
  assert.equal(result.webEvidence.sha, web);
  assert.equal(result.webEvidence.event, 'merge_group');
});
test('does not deploy an operations-only unstaged range or claim a Web admission', () => {
  const f = fixture(['scripts/lanes/lane_runner.py']);
  delete f.resolveEvidence;
  assert.deepEqual(resolveStagingCarryover(f), {
    stagingSha: base,
    deploymentId: 'dpl_exactStage',
    outcome: 'not_applicable',
  });
});
test('already staged current main stays a no-op without Git or provider reads', () => {
  const f = fixture();
  f.identity.commitSha = current;
  delete f.collectRange;
  delete f.resolveEvidence;
  assert.equal(resolveStagingCarryover(f).outcome, 'not_applicable');
});
for (const [name, mutate] of [
  ['foreign repository', f => (f.repository = 'foreign/Jovie')],
  ['malformed target', f => (f.expectedSha = 'main')],
  ['invalid source run', f => (f.sourceCiRunId = '0')],
  ['missing receipt', f => (f.currentReceipt = null)],
  ['missing provenance', f => delete f.currentReceipt.provenance],
  ['different receipt head', f => (f.currentReceipt.provenance.sha = web)],
  ['missing source binding', f => delete f.currentReceipt.releaseRouting],
  [
    'different source CI',
    f => (f.currentReceipt.releaseRouting.sourceMainRunId = '42'),
  ],
  ['failed aggregate', f => (f.currentReceipt.aggregatePassed = false)],
  ['missing lane list', f => delete f.currentReceipt.selectedLanes],
  ['non-string lane', f => (f.currentReceipt.selectedLanes = [null])],
  ['already selected Web', f => (f.currentReceipt.selectedLanes = ['web'])],
])
  test(`rejects ${name} before any historical lookup`, () => {
    const f = fixture();
    mutate(f);
    f.collectRange = () => assert.fail('must reject before Git');
    assert.throws(
      () => resolveStagingCarryover(f),
      /exact successful non-Web main CI/
    );
  });
for (const [name, mutate] of [
  ['missing identity', f => (f.identity = null)],
  ['missing staging SHA', f => delete f.identity.commitSha],
  ['invalid deployment', f => (f.identity.deploymentId = 'foreign')],
  ['production identity', f => (f.identity.environment = 'production')],
])
  test(`rejects ${name}`, () => {
    const f = fixture();
    mutate(f);
    assert.throws(
      () => resolveStagingCarryover(f),
      /canonical staging identity/
    );
  });
test('refuses an off-lineage staging base instead of substituting an arbitrary recent build', () => {
  const f = fixture();
  f.collectRange = () => ({
    cumulativeChangedPaths: ['pnpm-lock.yaml'],
    commitsNewestFirst: [
      {
        sha: current,
        firstParent: 'f'.repeat(40),
        changedPaths: ['pnpm-lock.yaml'],
      },
    ],
  });
  assert.throws(() => resolveStagingCarryover(f), /does not terminate/);
});
test('historical CI failure or missing receipt stays fail-closed', () => {
  const f = fixture();
  f.resolveEvidence = () => {
    throw new Error('no exact passing Web receipt');
  };
  assert.throws(
    () => resolveStagingCarryover(f),
    /no exact passing Web receipt/
  );
});
test('controller preserves sealed CI routing and consumes the qualified carryover outcome', () => {
  const workflow = readFileSync(
    '.github/workflows/staging-controller.yml',
    'utf8'
  );
  assert.match(workflow, /steps\.routing\.outputs\.outcome/);
  assert.match(workflow, /resolveStagingCarryover\(/);
  assert.match(workflow, /if \[ "\$outcome" = not_applicable \]/);
  assert.match(workflow, /\.carryover=\$proof\[0\]/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /node-version: 24\.21\.0/);
});

test('actual routing Bash handles no-op, stale generation, failed identity and wrong lineage', () => {
  const workflow = readFileSync(
    '.github/workflows/staging-controller.yml',
    'utf8'
  );
  const routing = workflow
    .split('      - id: routing\n')[1]
    .split('        run: |\n')[1]
    .split('      - uses:')[0]
    .split('\n')
    .map(line => line.replace(/^ {10}/, ''))
    .join('\n');
  const root = mkdtempSync(join(tmpdir(), 'stage-carryover-routing-'));
  try {
    mkdirSync(join(root, 'product-lane-release'));
    writeFileSync(
      join(root, 'product-lane-release/release.json'),
      JSON.stringify(fixture().currentReceipt)
    );
    writeFileSync(
      join(root, 'gh'),
      '#!/usr/bin/env node\nconst route=process.argv[3];if(route.endsWith("/commits/main"))console.log(process.env.TEST_MAIN);else if(route.includes("/compare/"))console.log(process.env.TEST_RELATION);else process.exit(9);\n'
    );
    writeFileSync(
      join(root, 'curl'),
      '#!/usr/bin/env node\nif(process.env.TEST_CURL_FAILURE)process.exit(7);process.stdout.write(process.env.TEST_IDENTITY);\n'
    );
    chmodSync(join(root, 'gh'), 0o755);
    chmodSync(join(root, 'curl'), 0o755);
    for (const [initial, main, relation, failedCurl, good] of [
      ['proceed', '', '', '1', true],
      ['superseded', '', '', '1', true],
      ['not_applicable', current, '', '', true],
      ['not_applicable', web, 'ahead', '1', true],
      ['not_applicable', 'malformed', '', '', false],
      ['not_applicable', web, 'diverged', '', false],
      ['not_applicable', current, '', '1', false],
    ]) {
      writeFileSync(
        join(root, 'staging-lineage.json'),
        JSON.stringify({
          schema: 'jovie-staging-lineage/v1',
          sha: current,
          outcome: initial,
          replacementSha: current,
        })
      );
      writeFileSync(join(root, 'output'), '');
      const result = spawnSync('bash', ['-c', routing], {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: root + delimiter + process.env.PATH,
          RUNNER_TEMP: root,
          GITHUB_OUTPUT: join(root, 'output'),
          INITIAL_OUTCOME: initial,
          EXPECTED_SHA: current,
          SOURCE_CI_RUN_ID: '37356737863',
          REPOSITORY: 'JovieInc/Jovie',
          TEST_MAIN: main,
          TEST_RELATION: relation,
          TEST_CURL_FAILURE: failedCurl,
          TEST_IDENTITY: JSON.stringify({
            commitSha: current,
            deploymentId: 'dpl_exactStage',
            environment: 'preview',
          }),
        },
      });
      if (!good) {
        assert.notEqual(result.status, 0);
        continue;
      }
      assert.equal(result.status, 0, result.stderr);
      const expectedOutcome =
        initial === 'not_applicable' && main !== current
          ? 'superseded'
          : initial;
      assert.equal(
        readFileSync(join(root, 'output'), 'utf8'),
        `outcome=${expectedOutcome}\n`
      );
      const lineage = JSON.parse(
        readFileSync(join(root, 'staging-lineage.json'), 'utf8')
      );
      assert.equal(lineage.outcome, expectedOutcome);
      if (expectedOutcome === 'superseded' && initial === 'not_applicable')
        assert.equal(lineage.replacementSha, web);
      if (initial === 'not_applicable' && main === current)
        assert.equal(lineage.carryover.stagingSha, current);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('actual routing stages current non-Web main after exact merge-group Web admission', () => {
  const workflow = readFileSync(
    '.github/workflows/staging-controller.yml',
    'utf8'
  );
  const routing = workflow
    .split('      - id: routing\n')[1]
    .split('        run: |\n')[1]
    .split('      - uses:')[0]
    .split('\n')
    .map(line => line.replace(/^ {10}/, ''))
    .join('\n');
  const root = mkdtempSync(join(tmpdir(), 'stage-carryover-success-'));
  try {
    const git = (...args) =>
      execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
    git('init', '--quiet');
    git('config', 'user.name', 'Release test');
    git('config', 'user.email', 'release-test@example.invalid');
    writeFileSync(join(root, 'README.md'), 'baseline\n');
    git('add', 'README.md');
    git('commit', '--quiet', '-m', 'baseline');
    const stagedSha = git('rev-parse', 'HEAD');
    writeFileSync(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n');
    git('add', 'pnpm-lock.yaml');
    git('commit', '--quiet', '-m', 'Web dependency');
    const webSha = git('rev-parse', 'HEAD');
    mkdirSync(join(root, 'scripts/lanes'), { recursive: true });
    writeFileSync(join(root, 'scripts/lanes/lane_runner.py'), '# operations\n');
    git('add', 'scripts/lanes/lane_runner.py');
    git('commit', '--quiet', '-m', 'operations');
    const mainSha = git('rev-parse', 'HEAD');
    // Import the real helper while its Git subprocesses run in fixture history.
    symlinkSync(resolve('.github'), join(root, '.github'), 'dir');
    mkdirSync(join(root, 'product-lane-release'));
    writeFileSync(
      join(root, 'product-lane-release/release.json'),
      JSON.stringify({
        ...fixture().currentReceipt,
        provenance: { sha: mainSha },
      })
    );
    const runId = 37354611740;
    const artifactId = 101;
    const run = {
      id: runId,
      run_attempt: 1,
      event: 'merge_group',
      head_sha: webSha,
      path: '.github/workflows/ci.yml',
      head_repository: { full_name: 'JovieInc/Jovie' },
      status: 'completed',
      conclusion: 'success',
    };
    const prefix = 'repos/JovieInc/Jovie';
    const routes = {
      [`${prefix}/actions/workflows/ci.yml/runs?event=merge_group&head_sha=${webSha}&status=completed&per_page=100`]:
        { workflow_runs: [run] },
      [`${prefix}/actions/workflows/ci.yml/runs?event=push&head_sha=${webSha}&status=completed&per_page=100`]:
        { workflow_runs: [] },
      [`${prefix}/actions/runs/${runId}/attempts/1/jobs?per_page=100`]: {
        total_count: 1,
        jobs: [{ ...run, run_id: runId, name: 'PR Ready' }],
      },
      [`${prefix}/actions/runs/${runId}/artifacts?per_page=100`]: {
        total_count: 1,
        artifacts: [
          {
            id: artifactId,
            expired: false,
            name: `product-lane-final-${webSha}-1`,
          },
        ],
      },
    };
    writeFileSync(join(root, 'routes.json'), JSON.stringify(routes));
    const receipt = {
      provenance: { sha: webSha, runId, runAttempt: 1 },
      aggregatePassed: true,
      selectedLanes: ['web'],
      admissions: {
        web: { selected: true, passed: true, results: ['success'] },
      },
    };
    writeFileSync(join(root, 'final.json'), JSON.stringify(receipt));
    writeFileSync(join(root, 'final.md'), 'qualified Web\n');
    execFileSync('zip', ['-q', 'evidence.zip', 'final.json', 'final.md'], {
      cwd: root,
    });
    writeFileSync(
      join(root, 'gh'),
      `#!/usr/bin/env node
const fs=require('node:fs');const route=process.argv[3];
if(route.endsWith('/commits/main'))process.stdout.write(process.env.TEST_MAIN);
else if(route.endsWith('/zip'))process.stdout.write(fs.readFileSync(process.env.RUNNER_TEMP+'/evidence.zip'));
else{const row=JSON.parse(fs.readFileSync(process.env.RUNNER_TEMP+'/routes.json','utf8'))[route];if(!row)process.exit(9);process.stdout.write(JSON.stringify(row));}
`
    );
    writeFileSync(
      join(root, 'curl'),
      '#!/usr/bin/env node\nprocess.stdout.write(process.env.TEST_IDENTITY);\n'
    );
    chmodSync(join(root, 'gh'), 0o755);
    chmodSync(join(root, 'curl'), 0o755);
    const env = {
      ...process.env,
      PATH: root + delimiter + process.env.PATH,
      RUNNER_TEMP: root,
      GITHUB_OUTPUT: join(root, 'output'),
      INITIAL_OUTCOME: 'not_applicable',
      EXPECTED_SHA: mainSha,
      SOURCE_CI_RUN_ID: '37356737863',
      REPOSITORY: 'JovieInc/Jovie',
      TEST_MAIN: mainSha,
      TEST_IDENTITY: JSON.stringify({
        commitSha: stagedSha,
        deploymentId: 'dpl_exactStage',
        environment: 'preview',
      }),
    };
    for (const admitted of [true, false]) {
      writeFileSync(
        join(root, 'staging-lineage.json'),
        JSON.stringify({
          sha: mainSha,
          outcome: 'not_applicable',
          replacementSha: mainSha,
        })
      );
      writeFileSync(join(root, 'output'), '');
      if (!admitted) {
        routes[
          `${prefix}/actions/runs/${runId}/attempts/1/jobs?per_page=100`
        ].jobs[0].conclusion = 'failure';
        writeFileSync(join(root, 'routes.json'), JSON.stringify(routes));
      }
      const result = spawnSync('bash', ['-c', routing], {
        cwd: root,
        env,
        encoding: 'utf8',
      });
      if (!admitted) {
        assert.notEqual(result.status, 0);
        assert.equal(readFileSync(join(root, 'output'), 'utf8'), '');
        continue;
      }
      assert.equal(result.status, 0, result.stderr);
      assert.equal(
        readFileSync(join(root, 'output'), 'utf8'),
        'outcome=proceed\n'
      );
      const lineage = JSON.parse(
        readFileSync(join(root, 'staging-lineage.json'), 'utf8')
      );
      assert.equal(lineage.outcome, 'proceed');
      assert.deepEqual(lineage.carryover.webEvidence, {
        sha: webSha,
        lane: 'web',
        event: 'merge_group',
        runId,
        runAttempt: 1,
        artifactId,
        artifactName: `product-lane-final-${webSha}-1`,
      });
      assert.equal(lineage.carryover.stagingSha, stagedSha);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
