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
import { afterEach, test } from 'node:test';
import {
  resolveStagingReleaseSource,
  runStagingReleaseSource,
} from './staging-release-source.mjs';

const repository = 'JovieInc/Jovie';
const sha = 'd79674db0f3ce591ca06dbe3162e7e574fb1d299';
const stageId = 36765368027;
const ciId = 36765305437;
const roots = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
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
  };
}

test('completed staging authorizes the original exact CI attempt after the measured FIFO race', () => {
  const f = fixture();
  // Actual Sept30 receipt arrived 19:57:40, after production failed19:56:48.
  const result = resolveStagingReleaseSource(f.input);
  assert.equal(result.eligible, true);
  assert.equal(result.ci.id, ciId);
  assert.equal(result.ci.run_attempt, 2);
  assert.equal(result.stagingArtifactId, '102');
  assert.equal(f.reads.length, 4);
  assert.ok(
    f.reads.every(
      route => !route.includes('/runs?') && !route.endsWith(`/runs/${ciId}`)
    )
  );
});

test('non-Web not-applicable completion still reaches cumulative production range planning; superseded does not', () => {
  for (const outcome of ['not_applicable', 'superseded']) {
    const f = fixture();
    f.completion.outcome = outcome;
    f.artifacts.pop();
    f.routes[
      `repos/${repository}/actions/runs/${stageId}/artifacts?per_page=100`
    ].total_count = 1;
    const result = resolveStagingReleaseSource(f.input);
    assert.equal(result.eligible, outcome === 'not_applicable');
    assert.equal(result.stagingArtifactId, '');
    assert.equal(result.ci.id, ciId);
  }
});

test('all staging identity, source-attempt and deployed-proof failures reject before production mutation', () => {
  const cases = [
    f => {
      f.input.repository = 'attacker/Jovie';
    },
    f => {
      f.trigger.path = '.github/workflows/ci.yml';
    },
    f => {
      f.trigger.conclusion = 'failure';
    },
    f => {
      f.trigger.head_repository.full_name = 'fork/Jovie';
    },
    f => {
      delete f.trigger.repository.id;
    },
    f => {
      f.trigger.head_repository.id++;
    },
    f => {
      f.routes[
        `repos/${repository}/actions/workflows/staging-controller.yml`
      ].id = 32;
    },
    f => {
      f.routes[
        `repos/${repository}/actions/runs/${stageId}/attempts/1`
      ].run_attempt = 2;
    },
    f => {
      f.routes[
        `repos/${repository}/actions/runs/${stageId}/artifacts?per_page=100`
      ].total_count = 3;
    },
    f => {
      f.artifacts[0].expired = true;
    },
    f => {
      f.artifacts.push({ ...f.artifacts[0] });
      f.routes[
        `repos/${repository}/actions/runs/${stageId}/artifacts?per_page=100`
      ].total_count = 3;
    },
    f => {
      f.artifacts[0].workflow_run.id = stageId + 1;
    },
    f => {
      f.completion.controllerRunAttempt = '2';
    },
    f => {
      f.completion.terminal = false;
    },
    f => {
      f.completion.outcome = 'unknown';
    },
    f => {
      f.ci.run_attempt = 3;
    },
    f => {
      f.ci.id = ciId + 1;
    },
    f => {
      f.ci.head_sha = 'a'.repeat(40);
    },
    f => {
      f.ci.conclusion = 'failure';
    },
    f => {
      f.deployment.sourceCiRunAttempt = '1';
    },
    f => {
      f.deployment.sourceCiRunId = String(ciId + 1);
    },
    f => {
      f.deployment.controllerRunAttempt = '2';
    },
    f => {
      f.deployment.repository = 'fork/Jovie';
    },
    f => {
      f.deployment.state = 'superseded_before_mutation';
    },
    f => {
      f.deployment.sha = 'a'.repeat(40);
    },
    f => {
      f.deployment.environment = 'production';
    },
    f => {
      f.deployment.privacy = 'public';
    },
    f => {
      f.deployment.routeSmoke = 'failed';
    },
  ];
  for (const mutate of cases) {
    const f = fixture();
    mutate(f);
    assert.throws(() => resolveStagingReleaseSource(f.input));
  }
});

function transportFixture() {
  const f = fixture();
  const root = mkdtempSync(join(tmpdir(), 'staging-source-test-'));
  roots.push(root);
  const event = join(root, 'event.json'),
    output = join(root, 'output');
  writeFileSync(event, JSON.stringify({ workflow_run: f.trigger }));
  const data = join(root, 'routes.json');
  writeFileSync(data, JSON.stringify(f.routes));
  for (const [id, name, value] of [
    [101, 'staging-completion.json', f.completion],
    [102, 'staging-deployment-receipt.json', f.deployment],
  ]) {
    writeFileSync(join(root, name), JSON.stringify(value));
    execFileSync('zip', ['-q', join(root, `${id}.zip`), name], { cwd: root });
  }
  const gh = join(root, 'gh');
  writeFileSync(
    gh,
    `#!/usr/bin/env node\nconst fs=require('node:fs');const route=process.argv[3];if(process.env.FAIL_SOURCE_TRANSPORT)process.exit(1);const id=route.endsWith("/zip")?route.split("/").at(-2):null;process.stdout.write(id?fs.readFileSync(${JSON.stringify(root)}+'/'+id+'.zip'):JSON.stringify(JSON.parse(fs.readFileSync(${JSON.stringify(data)},'utf8'))[route]));\n`
  );
  chmodSync(gh, 0o755);
  return {
    root,
    env: {
      ...process.env,
      GITHUB_EVENT_PATH: event,
      GITHUB_REPOSITORY: repository,
      GITHUB_OUTPUT: output,
      RUNNER_TEMP: root,
      PATH: `${root}${delimiter}${process.env.PATH}`,
    },
    output,
  };
}

test('real workflow command reads only authenticated data ZIP entries and writes original CI fields', () => {
  const f = transportFixture(),
    previousPath = process.env.PATH;
  process.env.PATH = f.env.PATH;
  try {
    assert.equal(runStagingReleaseSource(f.env).stagingArtifactId, '102');
    const output = Object.fromEntries(
      readFileSync(f.output, 'utf8')
        .trim()
        .split('\n')
        .map(line => {
          const n = line.indexOf('=');
          return [line.slice(0, n), line.slice(n + 1)];
        })
    );
    assert.equal(JSON.parse(output.ci).run_attempt, 2);
    assert.equal(output.eligible, 'true');
  } finally {
    process.env.PATH = previousPath;
  }
  const cli = spawnSync(
    process.execPath,
    [new URL('./staging-release-source.mjs', import.meta.url).pathname],
    { env: f.env, encoding: 'utf8' }
  );
  assert.equal(cli.status, 0, cli.stderr);
  const failed = spawnSync(
    process.execPath,
    [new URL('./staging-release-source.mjs', import.meta.url).pathname],
    { env: { ...f.env, FAIL_SOURCE_TRANSPORT: '1' }, encoding: 'utf8' }
  );
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /evidence transport failed: gh/);
});

test('actual production workflow transitions after staging completion, preserving exact source and FIFO contracts', () => {
  const workflow = readFileSync(
    new URL('../workflows/production-controller.yml', import.meta.url),
    'utf8'
  );
  assert.match(workflow, /workflows: \[Staging Controller\]/);
  assert.match(workflow, /staging-release-source\.mjs/);
  assert.match(
    workflow,
    /fromJSON\(needs\.release-source\.outputs\.ci\)\.run_attempt/
  );
  assert.doesNotMatch(workflow, /for attempt in \$\(seq 1 150\)/);
  assert.match(workflow, /group: production-mutation/);
  assert.match(workflow, /cancel-in-progress: false/);
});

test('actual terminal staging publisher handles non-Web, both supersession boundaries and failed mutation', () => {
  const workflow = readFileSync(
    new URL('../workflows/staging-controller.yml', import.meta.url),
    'utf8'
  );
  const script = workflow
    .slice(workflow.indexOf('  staging-result:'))
    .split('        run: |\n')[1]
    .split('      - uses:')[0]
    .split('\n')
    .map(line => line.slice(10))
    .join('\n')
    .replace(/\$\{\{ github.repository \}\}/g, repository)
    .replace(/\$\{\{ github.event.workflow_run.id \}\}/g, String(ciId))
    .replace(/\$\{\{ github.event.workflow_run.run_attempt \}\}/g, '2')
    .replace(/\$\{\{ github.run_id \}\}/g, String(stageId))
    .replace(/\$\{\{ github.run_attempt \}\}/g, '1');
  for (const [outcome, release, eligible, deployed, state, expected] of [
    ['proceed', 'success', 'true', 'true', 'current', 'deployed'],
    [
      'proceed',
      'success',
      'true',
      'true',
      'superseded_after_mutation',
      'deployed',
    ],
    ['not_applicable', 'skipped', '', '', '', 'not_applicable'],
    ['superseded', 'skipped', '', '', '', 'superseded'],
    ['proceed', 'success', 'false', '', '', 'superseded'],
    ['proceed', 'failure', 'true', '', '', null],
    ['proceed', 'success', 'true', 'false', '', null],
  ]) {
    const root = mkdtempSync(join(tmpdir(), 'staging-terminal-test-'));
    roots.push(root);
    const result = spawnSync('bash', ['-c', script], {
      encoding: 'utf8',
      env: {
        ...process.env,
        RUNNER_TEMP: root,
        AUTHORIZATION_RESULT: 'success',
        AUTHORIZATION_OUTCOME: outcome,
        EXACT_SHA: sha,
        RELEASE_RESULT: release,
        STAGING_ELIGIBLE: eligible,
        STAGING_DEPLOYED: deployed,
        STAGING_STATE: state,
      },
    });
    assert.equal(result.status, expected ? 0 : 1, result.stderr);
    if (expected) {
      const receipt = JSON.parse(
        readFileSync(join(root, 'staging-completion.json'), 'utf8')
      );
      assert.equal(receipt.outcome, expected);
      assert.equal(receipt.sourceCiRunAttempt, '2');
      assert.equal(receipt.sha, sha);
      assert.equal(receipt.controllerRunId, String(stageId));
    }
  }
});
