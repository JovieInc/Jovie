import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { test } from 'node:test';
import {
  resolveCanonicalStagingReceipt,
  runCanonicalStagingReceipt,
} from './canonical-staging-receipt.mjs';

const repository = 'JovieInc/Jovie';
const sha = 'd79674db0f3ce591ca06dbe3162e7e574fb1d299';
const stageId = 36765368027;
const ciId = 36765305437;
function fixture() {
  const trigger = {
    id: stageId,
    run_attempt: 1,
    workflow_id: 31,
    head_sha: sha,
    path: '.github/workflows/staging-controller.yml',
    event: 'workflow_run',
    head_branch: 'main',
    status: 'completed',
    conclusion: 'success',
    repository: { id: 1030964787, full_name: repository },
    head_repository: { id: 1030964787, full_name: repository },
  };
  const ci = {
    ...trigger,
    id: ciId,
    workflow_id: 30,
    run_attempt: 2,
    path: '.github/workflows/ci.yml',
    event: 'push',
  };
  const completion = {
    schema: 'jovie-staging-completion/v1',
    terminal: true,
    repository,
    sha,
    outcome: 'deployed',
    sourceCiRunId: String(ciId),
    sourceCiRunAttempt: '2',
    controllerRunId: String(stageId),
    controllerRunAttempt: '1',
  };
  const deployment = {
    ...completion,
    schema: 'jovie-staging-deployment/v1',
    state: 'superseded_after_mutation',
    deploymentId: 'dpl_exactStage',
    alias: 'staging.jov.ie',
    environment: 'preview',
    exactIdentity: 'passed',
    routeSmoke: 'passed',
    privacy: 'robots-block-all-and-http-noindex',
  };
  const artifacts = ['staging-completion-1', `staging-deployment-${sha}`].map(
    (name, index) => ({
      id: index + 101,
      name,
      expired: false,
      workflow_run: {
        id: stageId,
        repository_id: 1030964787,
        head_repository_id: 1030964787,
      },
    })
  );
  const routes = {
    [`repos/${repository}/actions/workflows/staging-controller.yml`]: {
      id: 31,
      name: 'Staging Controller',
      path: trigger.path,
      state: 'active',
    },
    [`repos/${repository}/actions/runs/${stageId}/attempts/1`]:
      structuredClone(trigger),
    [`repos/${repository}/actions/runs/${stageId}/artifacts?per_page=100`]: {
      total_count: 2,
      artifacts,
    },
    [`repos/${repository}/actions/runs/${ciId}/attempts/2`]: ci,
  };
  const producerJobs = {
    total_count: 1,
    jobs: [
      {
        id: 700,
        run_id: stageId,
        run_attempt: 1,
        head_sha: sha,
        head_branch: 'main',
        name: 'staging-release / Preserve exact staging deployment receipt',
        status: 'completed',
        conclusion: 'success',
      },
    ],
  };
  routes[
    `repos/${repository}/actions/runs/${stageId}/attempts/1/jobs?per_page=100`
  ] = producerJobs;
  const reads = [];
  const input = {
    repository,
    trigger,
    api: route => {
      reads.push(route);
      assert.ok(route in routes, `unexpected API ${route}`);
      return routes[route];
    },
    readArtifact: (id, name) => {
      assert.equal(
        name,
        id === 101
          ? 'staging-completion.json'
          : 'staging-deployment-receipt.json'
      );
      return id === 101 ? completion : deployment;
    },
  };
  return {
    input,
    routes,
    trigger,
    ci,
    completion,
    deployment,
    artifacts,
    reads,
    producerJobs,
  };
}

function canonicalFixture() {
  const f = fixture();
  const route = `repos/${repository}/actions/artifacts?name=staging-deployment-${sha}&per_page=100`;
  f.artifacts[1].workflow_run.head_sha = sha;
  f.routes[route] = { total_count: 1, artifacts: [f.artifacts[1]] };
  f.canonical = {
    ...f.input,
    expectedSha: sha,
    identity: { commitSha: sha, deploymentId: 'dpl_exactStage' },
  };
  return { ...f, route };
}
test('reuses a unique current deployment with its original successful CI attempt', () => {
  const f = canonicalFixture();
  assert.equal(resolveCanonicalStagingReceipt(f.canonical), '102');
  assert.ok(
    f.reads.includes(`repos/${repository}/actions/runs/${ciId}/attempts/2`)
  );
  assert.ok(
    f.reads.includes(
      `repos/${repository}/actions/runs/${stageId}/attempts/1/jobs?per_page=100`
    )
  );
});
test('an authenticated failed producer does not hide a later valid canonical receipt', () => {
  const f = canonicalFixture();
  const failedId = stageId + 50;
  const artifact = {
    ...f.artifacts[1],
    id: 500,
    workflow_run: { ...f.artifacts[1].workflow_run, id: failedId },
  };
  f.routes[f.route] = { total_count: 2, artifacts: [artifact, f.artifacts[1]] };
  f.routes[`repos/${repository}/actions/runs/${failedId}/attempts/1`] = {
    ...f.trigger,
    id: failedId,
    conclusion: 'failure',
  };
  const read = f.canonical.readArtifact;
  f.canonical.readArtifact = (id, name) =>
    id === 500
      ? { ...f.deployment, controllerRunId: String(failedId) }
      : read(id, name);
  assert.equal(resolveCanonicalStagingReceipt(f.canonical), '102');
  f.routes[f.route] = { total_count: 1, artifacts: [artifact] };
  assert.throws(
    () => resolveCanonicalStagingReceipt(f.canonical),
    /missing or ambiguous/
  );
});
for (const [name, mutate] of [
  [
    'foreign repository',
    f => {
      f.canonical.repository = 'foreign/repo';
    },
  ],
  [
    'unknown source',
    f => {
      f.canonical.expectedSha = '';
    },
  ],
  [
    'different live SHA',
    f => {
      f.canonical.identity.commitSha = 'f'.repeat(40);
    },
  ],
  [
    'unknown deployment',
    f => {
      f.canonical.identity.deploymentId = '';
    },
  ],
  [
    'foreign receipt',
    f => {
      f.deployment.repository = 'foreign/repo';
    },
  ],
  [
    'different receipt SHA',
    f => {
      f.deployment.sha = 'f'.repeat(40);
    },
  ],
  [
    'missing producer',
    f => {
      f.deployment.controllerRunId = '';
    },
  ],
  [
    'unknown attempt',
    f => {
      f.deployment.controllerRunAttempt = '0';
    },
  ],
  [
    'artifact producer mismatch',
    f => {
      f.artifacts[1].workflow_run.id++;
    },
  ],
  [
    'artifact head mismatch',
    f => {
      f.artifacts[1].workflow_run.head_sha = 'f'.repeat(40);
    },
  ],
  [
    'different deployment',
    f => {
      f.deployment.deploymentId = 'dpl_old';
    },
  ],
  [
    'expired receipt',
    f => {
      f.artifacts[1].expired = true;
    },
  ],
  [
    'wrong artifact name',
    f => {
      f.artifacts[1].name = 'other';
    },
  ],
  [
    'truncated listing',
    f => {
      f.routes[f.route].total_count = 2;
    },
  ],
  [
    'over-budget listing',
    f => {
      f.routes[f.route].total_count = 1001;
    },
  ],
  [
    'duplicate artifacts',
    f => {
      f.routes[f.route] = {
        total_count: 2,
        artifacts: [f.artifacts[1], f.artifacts[1]],
      };
    },
  ],
  [
    'failed source CI',
    f => {
      f.ci.conclusion = 'failure';
    },
  ],
  [
    'missing producer job',
    f => {
      f.producerJobs.jobs[0].conclusion = 'skipped';
    },
  ],
  [
    'partial producer',
    f => {
      f.routes[
        `repos/${repository}/actions/runs/${stageId}/attempts/1`
      ].conclusion = 'cancelled';
    },
  ],
  [
    'wrong completion outcome',
    f => {
      f.completion.outcome = 'not_applicable';
    },
  ],
])
  test(`refuses ${name}`, () => {
    const f = canonicalFixture();
    mutate(f);
    assert.throws(() => resolveCanonicalStagingReceipt(f.canonical));
  });
test('unknown optional identities and malformed receipt never authorize', () => {
  for (const mutate of [
    f => {
      delete f.canonical.expectedSha;
    },
    f => {
      f.canonical.identity = null;
    },
    f => {
      delete f.canonical.identity.deploymentId;
    },
    f => {
      f.canonical.readArtifact = () => null;
    },
    f => {
      delete f.deployment.controllerRunId;
    },
    f => {
      delete f.deployment.controllerRunAttempt;
    },
    f => {
      delete f.artifacts[1].workflow_run;
    },
  ]) {
    const f = canonicalFixture();
    mutate(f);
    assert.throws(() => resolveCanonicalStagingReceipt(f.canonical));
  }
});
test('ignores historical deployments rather than selecting the latest', () => {
  const f = canonicalFixture();
  const historical = { ...f.artifacts[1], id: 104 };
  f.routes[f.route] = {
    total_count: 2,
    artifacts: [historical, f.artifacts[1]],
  };
  const read = f.canonical.readArtifact;
  f.canonical.readArtifact = (id, name) =>
    id === 104 ? { ...f.deployment, deploymentId: 'dpl_old' } : read(id, name);
  assert.equal(resolveCanonicalStagingReceipt(f.canonical), '102');
});
test('rejects two independently returned receipts for the same canonical deployment', () => {
  const f = canonicalFixture();
  f.routes[f.route] = {
    total_count: 2,
    artifacts: [f.artifacts[1], { ...f.artifacts[1], id: 104 }],
  };
  const read = f.canonical.readArtifact;
  f.canonical.readArtifact = (id, name) =>
    id === 104 ? f.deployment : read(id, name);
  assert.throws(
    () => resolveCanonicalStagingReceipt(f.canonical),
    /completion mismatch/
  );
});
function cliFixture() {
  const f = canonicalFixture();
  const root = mkdtempSync(join(tmpdir(), 'canonical-stage-test-'));
  writeFileSync(
    join(root, 'staging-completion.json'),
    JSON.stringify(f.completion)
  );
  writeFileSync(
    join(root, 'staging-deployment-receipt.json'),
    JSON.stringify(f.deployment)
  );
  execFileSync(
    'zip',
    [
      '-q',
      'evidence.zip',
      'staging-completion.json',
      'staging-deployment-receipt.json',
    ],
    { cwd: root }
  );
  writeFileSync(join(root, 'routes.json'), JSON.stringify(f.routes));
  writeFileSync(
    join(root, 'gh'),
    `#!/usr/bin/env node\nconst fs=require('node:fs');const route=process.argv[3];if(process.env.TEST_TRANSPORT_FAILURE)process.exit(9);if(route.endsWith('/zip'))process.stdout.write(fs.readFileSync(${JSON.stringify(join(root, 'evidence.zip'))}));else{const row=JSON.parse(fs.readFileSync(${JSON.stringify(join(root, 'routes.json'))},'utf8'))[route];if(!row)process.exit(8);process.stdout.write(JSON.stringify(row));}\n`
  );
  chmodSync(join(root, 'gh'), 0o755);
  return {
    root,
    env: {
      ...process.env,
      PATH: root + delimiter + process.env.PATH,
      REPOSITORY: repository,
      EXPECTED_SHA: sha,
      CANONICAL_STAGING_IDENTITY: JSON.stringify(f.canonical.identity),
      RUNNER_TEMP: root,
    },
  };
}
test('CLI reads actual ZIP data, returns only the bound ID and cleans temporary receipts', () => {
  const f = cliFixture();
  try {
    assert.equal(runCanonicalStagingReceipt(f.env), '102');
    const run = spawnSync(
      process.execPath,
      ['.github/scripts/canonical-staging-receipt.mjs'],
      { env: f.env, encoding: 'utf8' }
    );
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout.trim(), '102');
    for (const env of [
      { ...f.env, TEST_TRANSPORT_FAILURE: '1' },
      { ...f.env, CANONICAL_STAGING_IDENTITY: '{}' },
    ]) {
      const failure = spawnSync(
        process.execPath,
        ['.github/scripts/canonical-staging-receipt.mjs'],
        { env, encoding: 'utf8' }
      );
      assert.equal(failure.status, 1);
      assert.equal(failure.stdout, '');
    }
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});
test('CLI handles a missing runner temp and module import without argv', () => {
  const f = cliFixture();
  try {
    const env = { ...f.env };
    delete env.RUNNER_TEMP;
    assert.equal(runCanonicalStagingReceipt(env), '102');
    const imported = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        "await import('./.github/scripts/canonical-staging-receipt.mjs')",
      ],
      { env, encoding: 'utf8' }
    );
    assert.equal(imported.status, 0, imported.stderr);
    assert.equal(imported.stdout, '');
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});
test('actual controller Bash keeps exact artifact and authenticates empty-ID fallback', () => {
  const workflow = readFileSync(
    '.github/workflows/production-controller.yml',
    'utf8'
  );
  const start = workflow.indexOf(
    '              if [ "$staging_receipt_sha" = "$EXPECTED_SHA" ]; then'
  );
  const end = workflow.indexOf('              staging_receipt_dir=', start);
  assert.ok(start > 0 && end > start);
  const script =
    'set -euo pipefail\n' +
    workflow.slice(start, end) +
    '\nprintf "%s|%s" "$staging_artifact_id" "$staging_deployment_id"';
  const f = cliFixture();
  try {
    writeFileSync(
      join(f.root, 'curl'),
      `#!/usr/bin/env node\nif(process.env.TEST_CURL_FAILURE)process.exit(7);process.stdout.write(process.env.TEST_CANONICAL_IDENTITY);\n`
    );
    chmodSync(join(f.root, 'curl'), 0o755);
    const base = {
      ...f.env,
      staging_receipt_sha: sha,
      staging_deployment_id: '',
      TEST_CANONICAL_IDENTITY: f.env.CANONICAL_STAGING_IDENTITY,
    };
    for (const [exact, identity, failed, expected] of [
      ['999', base.TEST_CANONICAL_IDENTITY, '', '999|'],
      ['', base.TEST_CANONICAL_IDENTITY, '', '102|dpl_exactStage'],
      [
        '',
        JSON.stringify({
          commitSha: 'f'.repeat(40),
          deploymentId: 'dpl_exactStage',
        }),
        '',
        null,
      ],
      ['', JSON.stringify({ commitSha: sha, deploymentId: '' }), '', null],
      [
        '',
        JSON.stringify({ commitSha: sha, deploymentId: 'dpl_old' }),
        '',
        null,
      ],
      ['', base.TEST_CANONICAL_IDENTITY, '1', null],
    ]) {
      const run = spawnSync('bash', ['-c', script], {
        encoding: 'utf8',
        env: {
          ...base,
          EXACT_STAGING_ARTIFACT_ID: exact,
          TEST_CANONICAL_IDENTITY: identity,
          TEST_CURL_FAILURE: failed,
        },
      });
      if (expected === null) assert.notEqual(run.status, 0, run.stderr);
      else assert.equal(run.status, 0, run.stderr);
      if (expected !== null) assert.equal(run.stdout, expected);
    }
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('actual controller rebinds historical Web only to authenticated staging on its release lineage', () => {
  const workflow = readFileSync(
    '.github/workflows/production-controller.yml',
    'utf8'
  );
  const start = workflow.indexOf(
    '              if [ "$staging_receipt_sha" = "$EXPECTED_SHA" ]; then'
  );
  const end = workflow.indexOf('              staging_receipt_dir=', start);
  const script =
    'set -euo pipefail\n' +
    workflow.slice(start, end) +
    '\nprintf "%s|%s|%s" "$staging_artifact_id" "$staging_deployment_id" "$staging_receipt_sha"';
  const oldSha = 'a'.repeat(40);
  const f = cliFixture();
  try {
    const gh = readFileSync(join(f.root, 'gh'), 'utf8');
    writeFileSync(
      join(f.root, 'gh'),
      gh.replace(
        "if(route.endsWith('/zip'))",
        "if(route.includes('name=staging-deployment-" +
          oldSha +
          "&')){process.stdout.write(process.env.TEST_HISTORICAL_ARTIFACT || '');process.exit(0);}if(route.includes('/compare/')){process.stdout.write(route.includes('/compare/" +
          oldSha +
          "...') ? process.env.TEST_WEB_TO_STAGE : process.env.TEST_STAGE_TO_MAIN);process.exit(0);}if(route.endsWith('/zip'))"
      )
    );
    writeFileSync(
      join(f.root, 'curl'),
      '#!/usr/bin/env node\nif(process.env.TEST_CURL_FAILURE)process.exit(7);process.stdout.write(process.env.TEST_CANONICAL_IDENTITY);\n'
    );
    chmodSync(join(f.root, 'curl'), 0o755);
    for (const [
      historical,
      identity,
      failCurl,
      expected,
      target = sha,
      webToStage = 'ahead',
      stageToMain = 'identical',
    ] of [
      ['', f.env.CANONICAL_STAGING_IDENTITY, '', `102|dpl_exactStage|${sha}`],
      ['999', '', '1', `999||${oldSha}`],
      // S carried historical Web H; operations-only C may advance main while S
      // is still canonical staging and production has not advanced from P.
      [
        '',
        f.env.CANONICAL_STAGING_IDENTITY,
        '',
        `102|dpl_exactStage|${sha}`,
        'c'.repeat(40),
        'ahead',
        'ahead',
      ],
      [
        '',
        f.env.CANONICAL_STAGING_IDENTITY,
        '',
        null,
        'c'.repeat(40),
        'behind',
        'ahead',
      ],
      [
        '',
        f.env.CANONICAL_STAGING_IDENTITY,
        '',
        null,
        'c'.repeat(40),
        'ahead',
        'diverged',
      ],
      [
        '',
        f.env.CANONICAL_STAGING_IDENTITY,
        '',
        null,
        'c'.repeat(40),
        'ahead',
        'behind',
      ],
      [
        '',
        f.env.CANONICAL_STAGING_IDENTITY,
        '',
        null,
        'c'.repeat(40),
        '',
        'ahead',
      ],
      [
        '',
        JSON.stringify({ commitSha: oldSha, deploymentId: 'dpl_old' }),
        '',
        null,
      ],
      [
        '',
        JSON.stringify({ commitSha: sha, deploymentId: 'dpl_wrong' }),
        '',
        null,
      ],
      ['', f.env.CANONICAL_STAGING_IDENTITY, '1', null],
    ]) {
      const result = spawnSync('bash', ['-c', script], {
        encoding: 'utf8',
        env: {
          ...f.env,
          EXPECTED_SHA: target,
          TEST_WEB_TO_STAGE: webToStage,
          TEST_STAGE_TO_MAIN: stageToMain,
          staging_receipt_sha: oldSha,
          staging_deployment_id: '',
          staging_artifact_name: `staging-deployment-${oldSha}`,
          EXACT_STAGING_ARTIFACT_ID: '',
          TEST_HISTORICAL_ARTIFACT: historical,
          TEST_CANONICAL_IDENTITY: identity,
          TEST_CURL_FAILURE: failCurl,
        },
      });
      if (expected === null) assert.notEqual(result.status, 0, result.stdout);
      else {
        assert.equal(result.status, 0, result.stderr);
        assert.equal(result.stdout, expected);
      }
    }
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});
