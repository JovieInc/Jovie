import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { inspectProductionStagingEvidence } from '../production-staging-evidence.mjs';

const A = 'a'.repeat(40),
  B = 'b'.repeat(40),
  C = 'c'.repeat(40);
const repository = 'JovieInc/Jovie';
const roots = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const identity = {
    commitSha: B,
    deploymentId: 'dpl_B',
    environment: 'preview',
  };
  const receipt = {
    schema: 'jovie-staging-deployment/v1',
    repository,
    terminal: true,
    state: 'superseded_after_mutation',
    sha: B,
    deploymentId: 'dpl_B',
    alias: 'staging.jov.ie',
    environment: 'preview',
    exactIdentity: 'passed',
    routeSmoke: 'passed',
    sourceCiRunId: '20',
    sourceCiRunAttempt: '1',
    controllerRunId: '30',
    controllerRunAttempt: '1',
  };
  const artifact = {
    id: 40,
    name: `staging-deployment-${B}`,
    expired: false,
    workflow_run: { id: 30, head_sha: B },
  };
  const run = (id, path, event) => ({
    id,
    run_attempt: 1,
    head_sha: B,
    head_branch: 'main',
    head_repository: { full_name: repository },
    status: 'completed',
    conclusion: 'success',
    path,
    event,
  });
  const source = run(20, '.github/workflows/ci.yml', 'push');
  const controller = run(
    30,
    '.github/workflows/staging-controller.yml',
    'workflow_run'
  );
  const job = (name, id) => ({
    name,
    run_id: id,
    run_attempt: 1,
    head_sha: B,
    status: 'completed',
    conclusion: 'success',
  });
  const controllerJobs = [
    'Attest staging build provenance',
    'Canary Health Gate (staging) / Canary health gate',
    'Alias verified preview to staging.jov.ie',
    'Preserve exact staging deployment receipt',
  ].map(name => job(`staging-release / ${name}`, 30));
  const sourceJobs = [job('Main Release Ready', 20)];
  const responses = {
    [`repos/${repository}/compare/${A}...${B}`]: { status: 'ahead' },
    [`repos/${repository}/compare/${B}...${C}`]: {
      status: 'ahead',
      files: [{ filename: 'docs/OPS.md' }],
    },
    [`repos/${repository}/actions/artifacts?name=staging-deployment-${B}&per_page=100`]:
      { total_count: 1, artifacts: [artifact] },
    [`repos/${repository}/actions/runs/30/attempts/1`]: controller,
    [`repos/${repository}/actions/runs/20/attempts/1`]: source,
    [`repos/${repository}/actions/runs/30/attempts/1/jobs?per_page=100`]: {
      total_count: 4,
      jobs: controllerJobs,
    },
    [`repos/${repository}/actions/runs/20/attempts/1/jobs?per_page=100`]: {
      total_count: 1,
      jobs: sourceJobs,
    },
  };
  const ghJsonImpl = vi.fn(path => {
    if (!(path in responses))
      throw new Error(`unexpected API request: ${path}`);
    return responses[path];
  });
  const options = {
    repository,
    expectedSha: B,
    lowerBoundSha: A,
    identity,
    ghJsonImpl,
    downloadReceiptImpl: vi.fn(() => receipt),
  };
  return {
    options,
    receipt,
    artifact,
    controller,
    source,
    controllerJobs,
    sourceJobs,
    responses,
    inspect: () => inspectProductionStagingEvidence(options),
  };
}

describe('production staging proof selection', () => {
  it('uses the exact staged B when historical web-changing A was coalesced, without asking for an A deployment', () => {
    const f = fixture();
    expect(f.inspect()).toMatchObject({
      state: 'verified',
      sha: B,
      deploymentId: 'dpl_B',
      artifactId: 40,
    });
    expect(
      f.options.ghJsonImpl.mock.calls
        .flat()
        .some(path => path.includes(`staging-deployment-${A}`))
    ).toBe(false);
  });
  it('accepts staged B below a still-current operations descendant C without changing the production target', () => {
    const f = fixture();
    f.options.expectedSha = C;
    expect(f.inspect()).toMatchObject({ state: 'verified', sha: B });
    expect(f.options.expectedSha).toBe(C);
  });
  it('retains exact ancestor staging proof for a live-unbound operations-only range', () => {
    const f = fixture();
    f.options.lowerBoundSha = null;
    f.options.expectedSha = C;
    expect(f.inspect()).toMatchObject({ state: 'verified', sha: B });
  });
  it.each([
    { status: 'ahead', files: [{ filename: 'apps/web/app/page.tsx' }] },
    {
      status: 'ahead',
      files: [
        {
          filename: 'docs/page.md',
          previous_filename: 'apps/web/app/page.tsx',
        },
      ],
    },
    { status: 'ahead' },
    {
      status: 'ahead',
      files: Array.from({ length: 300 }, () => ({ filename: 'docs/OPS.md' })),
    },
  ])(
    'rejects web differences or incomplete staging-to-target tree proof',
    proof => {
      const f = fixture();
      f.options.expectedSha = C;
      f.responses[`repos/${repository}/compare/${B}...${C}`] = proof;
      expect(f.inspect).toThrow(/web changes|incomplete/);
    }
  );
  it('accepts staging exactly at the historical web bound', () => {
    const f = fixture();
    f.options.lowerBoundSha = B;
    expect(f.inspect().state).toBe('verified');
  });
  it.each(['behind', 'diverged', ''])(
    'rejects staging outside the target lineage: %s',
    status => {
      const f = fixture();
      f.options.expectedSha = C;
      f.responses[`repos/${repository}/compare/${B}...${C}`] = { status };
      expect(f.inspect).toThrow('outside');
      expect(f.options.downloadReceiptImpl).not.toHaveBeenCalled();
    }
  );
  it.each(['diverged', ''])(
    'rejects staging missing ancestry to the required web change: %s',
    status => {
      const f = fixture();
      f.responses[`repos/${repository}/compare/${A}...${B}`] = { status };
      expect(f.inspect).toThrow('required web evidence');
    }
  );
  it('waits for staging to include the required web evidence', () => {
    const f = fixture();
    f.responses[`repos/${repository}/compare/${A}...${B}`] = {
      status: 'behind',
    };
    expect(f.inspect().state).toBe('pending');
    expect(f.options.downloadReceiptImpl).not.toHaveBeenCalled();
  });
  it.each([
    ['sha', A],
    ['deploymentId', 'dpl_wrong'],
    ['alias', 'jov.ie'],
    ['environment', 'production'],
    ['terminal', false],
    ['state', 'superseded'],
    ['exactIdentity', 'failed'],
    ['routeSmoke', 'failed'],
    ['sourceCiRunId', ''],
    ['sourceCiRunAttempt', '0'],
    ['repository', 'other/repo'],
  ])('rejects invalid receipt %s', (key, value) => {
    const f = fixture();
    f.receipt[key] = value;
    expect(f.inspect).toThrow('receipt identity');
  });
  it.each(['commitSha', 'deploymentId', 'environment'])(
    'rejects invalid canonical identity %s',
    key => {
      const f = fixture();
      f.options.identity[key] = 'invalid';
      expect(f.inspect).toThrow('Canonical staging identity');
    }
  );
  it('waits for an absent exact artifact', () => {
    const f = fixture();
    f.responses[
      `repos/${repository}/actions/artifacts?name=staging-deployment-${B}&per_page=100`
    ] = { total_count: 0, artifacts: [] };
    expect(f.inspect().state).toBe('pending');
  });
  it('rejects multiple exact artifacts instead of choosing a convenient one', () => {
    const f = fixture();
    f.responses[
      `repos/${repository}/actions/artifacts?name=staging-deployment-${B}&per_page=100`
    ] = { total_count: 2, artifacts: [f.artifact, { ...f.artifact, id: 41 }] };
    expect(f.inspect).toThrow('ambiguous');
  });
  it('rejects incomplete artifact listings', () => {
    const f = fixture();
    f.responses[
      `repos/${repository}/actions/artifacts?name=staging-deployment-${B}&per_page=100`
    ].total_count = 2;
    expect(f.inspect).toThrow('Incomplete');
  });
  it('rejects foreign artifact provenance', () => {
    const f = fixture();
    f.artifact.workflow_run.id = 31;
    expect(f.inspect).toThrow('bound to its controller');
  });
  it('waits until the exact staging controller has completed', () => {
    const f = fixture();
    f.controller.status = 'in_progress';
    expect(f.inspect().state).toBe('pending');
  });
  it.each(['source', 'controller'])(
    'rejects wrong or failed %s attempts',
    kind => {
      for (const patch of [
        { head_sha: A },
        { run_attempt: 2 },
        { conclusion: 'failure' },
        { event: 'pull_request' },
        { head_repository: { full_name: 'other/repo' } },
      ]) {
        const f = fixture();
        Object.assign(f[kind], patch);
        expect(f.inspect).toThrow('exact successful workflow');
      }
    }
  );
  it.each([0, 1, 2, 3])(
    'rejects failed staging attestation/canary/alias/receipt job %i',
    index => {
      const f = fixture();
      f.controllerJobs[index].conclusion = 'failure';
      expect(f.inspect).toThrow('lacks successful');
    }
  );
  it('rejects failed exact source CI gate', () => {
    const f = fixture();
    f.sourceJobs[0].conclusion = 'skipped';
    expect(f.inspect).toThrow('Main Release Ready');
  });
});

function runWait({ decision = 'yield', gateExit = 0 } = {}) {
  const repo = resolve(import.meta.dirname, '../../..');
  const workflow = readFileSync(
    join(repo, '.github/workflows/production-controller.yml'),
    'utf8'
  );
  const start = workflow.indexOf(
    '            if [ "$run_web" = true ]; then\n              # Historical Web'
  );
  const end = workflow.indexOf('\n            final_main_sha=', start);
  const script =
    'set -euo pipefail\n' +
    workflow
      .slice(start, end)
      .split('\n')
      .map(line => line.slice(12))
      .join('\n');
  const root = mkdtempSync(join(tmpdir(), 'staging-proof-wait-'));
  roots.push(root);
  mkdirSync(join(root, '.github/scripts'), { recursive: true });
  mkdirSync(join(root, 'bin'));
  writeFileSync(
    join(root, '.github/scripts/release-lineage-gate.sh'),
    `test "$IN_FLIGHT" = false || exit 9\nprintf 'decision=${decision}\\n'\nexit ${gateExit}\n`
  );
  for (const [name, body] of Object.entries({
    gh: `printf '${C}\\n'`,
    node: `echo proof >> "$RUNNER_TEMP/calls"; printf '{"state":"verified","sha":"${B}"}\\n'`,
    sleep: 'echo sleep >> "$RUNNER_TEMP/calls"; exit 2',
  })) {
    const path = join(root, 'bin', name);
    writeFileSync(path, `#!/bin/sh\n${body}\n`);
    chmodSync(path, 0o755);
  }
  writeFileSync(join(root, 'calls'), '');
  writeFileSync(join(root, 'output'), '');
  const result = spawnSync('bash', ['-c', script], {
    cwd: root,
    encoding: 'utf8',
    timeout: 15000,
    env: {
      ...process.env,
      PATH: `${join(root, 'bin')}:${process.env.PATH}`,
      RUNNER_TEMP: root,
      GITHUB_OUTPUT: join(root, 'output'),
      EXPECTED_SHA: B,
      REPOSITORY: repository,
      run_web: 'true',
      web_evidence_sha: A,
      deployed_sha: A,
    },
  });
  return {
    result,
    calls: readFileSync(join(root, 'calls'), 'utf8'),
    output: readFileSync(join(root, 'output'), 'utf8'),
  };
}

describe('actual controller staging proof boundary', () => {
  it('yields an obsolete generation before proof lookup or sleep', () => {
    const run = runWait();
    expect(run.result.status, run.result.stderr).toBe(0);
    expect(run.calls).toBe('');
    expect(run.output).toContain('is_current=false');
    expect(run.output).not.toContain('staging_verified=true');
  });
  it('stops unknown successor visibility before proof lookup', () => {
    const run = runWait({ decision: 'error', gateExit: 1 });
    expect(run.result.status).toBe(1);
    expect(run.calls).toBe('');
  });
  it('admits a verified staging proof only after the lineage gate', () => {
    const run = runWait({ decision: 'proceed' });
    expect(run.result.status, run.result.stderr).toBe(0);
    expect(run.calls).toBe('proof\n');
    expect(run.output).toContain('staging_verified=true');
  });
});

describe('staging evidence CLI transport', () => {
  it.each([false, true])(
    'reads the downloaded exact receipt; corrupt archive=%s',
    corrupt => {
      const f = fixture();
      const root = mkdtempSync(join(tmpdir(), 'staging-proof-cli-'));
      roots.push(root);
      mkdirSync(join(root, 'bin'));
      writeFileSync(join(root, 'api.json'), JSON.stringify(f.responses));
      const entry = corrupt ? 'wrong.json' : 'staging-deployment-receipt.json';
      writeFileSync(join(root, entry), JSON.stringify(f.receipt));
      const zip = spawnSync('zip', ['-q', 'artifact.zip', entry], {
        cwd: root,
      });
      expect(zip.status).toBe(0);
      const gh = join(root, 'bin', 'gh');
      writeFileSync(
        gh,
        `#!${process.execPath}\nconst fs = require('node:fs');\nconst p=process.argv[3];\nif(p.endsWith('/zip')) process.stdout.write(fs.readFileSync('${root}/artifact.zip'));\nelse { const response=JSON.parse(fs.readFileSync('${root}/api.json'))[p]; if(!response) process.exit(2); process.stdout.write(JSON.stringify(response)); }\n`
      );
      chmodSync(gh, 0o755);
      const curl = join(root, 'bin', 'curl');
      writeFileSync(
        curl,
        `#!/bin/sh\nprintf '%s' '${JSON.stringify(f.options.identity)}'\n`
      );
      chmodSync(curl, 0o755);
      const result = spawnSync(
        process.execPath,
        [resolve(import.meta.dirname, '../production-staging-evidence.mjs')],
        {
          encoding: 'utf8',
          timeout: 15000,
          env: {
            ...process.env,
            PATH: `${join(root, 'bin')}:${process.env.PATH}`,
            REPOSITORY: repository,
            EXPECTED_SHA: B,
            STAGING_LOWER_BOUND_SHA: A,
          },
        }
      );
      if (corrupt) {
        expect(result.status).toBe(1);
        expect(result.stderr).toContain('contents are ambiguous');
      } else {
        expect(result.status, result.stderr).toBe(0);
        expect(JSON.parse(result.stdout)).toMatchObject({
          state: 'verified',
          sha: B,
          artifactId: 40,
        });
      }
    }
  );
});
