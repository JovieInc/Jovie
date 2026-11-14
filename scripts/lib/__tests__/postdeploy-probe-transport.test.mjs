import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import {
  collectProbeHistory,
  createGitHubTransport,
  executeProbeAdmission,
  MAX_JSON_BYTES,
  main,
} from '../../postdeploy-probe-admission.mjs';
import {
  admissionArtifactName,
  PROBE_JOBS,
  reserveProbeAttempt,
} from '../postdeploy-probe-admission.mjs';
import { storedZip } from '../real-gh-harness.mjs';

const roots = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
function workspace() {
  const root = mkdtempSync(join(tmpdir(), 'probe-transport-'));
  roots.push(root);
  return root;
}
function context(extra = {}) {
  return {
    repository: 'JovieInc/Jovie',
    workflowPath: '.github/workflows/postdeploy-probes.yml',
    workflowSha: 'c'.repeat(40),
    runId: 300,
    runAttempt: 1,
    mode: 'automatic',
    now: '2026-11-14T06:30:00Z',
    target: {
      sha: 'a'.repeat(40),
      deploymentId: 'dpl_fixture',
      origin: 'https://jovie-fixture-jovie.vercel.app',
      policyDigest: 'b'.repeat(64),
    },
    ...extra,
  };
}
function jobs(runId, attempt, conclusion = 'success') {
  return {
    total_count: 3,
    jobs: Object.entries(PROBE_JOBS).map(([key, value], index) => ({
      id: runId * 100 + attempt * 10 + index,
      run_id: runId,
      run_attempt: attempt,
      name: value.name,
      head_sha: 'c'.repeat(40),
      head_branch: 'main',
      status: 'completed',
      conclusion: key === 'smoke' ? conclusion : 'success',
      completed_at: `2026-11-14T05:${String(attempt).padStart(2, '0')}:00Z`,
      steps: value.steps.map(name => ({
        name,
        status: 'completed',
        conclusion: key === 'smoke' ? conclusion : 'success',
      })),
    })),
  };
}
function capsule(
  runId = 100,
  attempt = 1,
  conclusion = 'success',
  pending = false,
  suffix = false
) {
  const c = context({ runId, runAttempt: attempt });
  const ledger = reserveProbeAttempt(c);
  // Earlier immutable reservations precede their authoritative completed jobs.
  ledger.attempts[0].completedAt = '2026-11-14T04:00:00Z';
  return {
    id: runId * 100 + attempt,
    name:
      admissionArtifactName(c.target) + (suffix ? `-attempt-${attempt}` : ''),
    expired: false,
    size_in_bytes: 400,
    workflow_run: { id: runId },
    ledger,
    run: {
      id: runId,
      run_attempt: attempt,
      repository: { full_name: 'JovieInc/Jovie' },
      head_repository: { full_name: 'JovieInc/Jovie' },
      head_branch: 'main',
      path: c.workflowPath,
      event: 'workflow_run',
      status: pending ? 'in_progress' : 'completed',
      conclusion: pending ? null : 'failure',
      head_sha: 'c'.repeat(40),
    },
    jobs: jobs(runId, attempt, conclusion),
  };
}
function fixtureTransport(entries = [], change = {}) {
  const calls = [];
  const metadata = ({ ledger, run, jobs, ...row }) => row;
  return {
    calls,
    getJson(endpoint) {
      calls.push(endpoint);
      if (endpoint.includes('/actions/artifacts?'))
        return (
          change.index ?? {
            total_count: entries.filter(
              row => !/-attempt-[0-9]+$/.test(row.name)
            ).length,
            artifacts: entries
              .filter(row => !/-attempt-[0-9]+$/.test(row.name))
              .map(metadata),
          }
        );
      const artifacts = endpoint.match(
        /\/runs\/(\d+)\/artifacts\?per_page=100$/u
      );
      if (artifacts) {
        const rows = entries
          .filter(row => row.ledger.runId === Number(artifacts[1]))
          .map(metadata);
        return change.runIndex ?? { total_count: rows.length, artifacts: rows };
      }
      const match = endpoint.match(
        /\/runs\/(\d+)\/attempts\/(\d+)(\/jobs\?per_page=100)?$/u
      );
      if (!match) throw new Error('Unexpected endpoint');
      const row = entries.find(
        row =>
          row.ledger.runId === Number(match[1]) &&
          row.ledger.attempts[0].runAttempt === Number(match[2])
      );
      return match[3] ? row.jobs : { ...row.run, ...change.run };
    },
    getLedger(_repo, id) {
      calls.push(`zip:${id}`);
      return entries.find(row => row.id === id).ledger;
    },
  };
}
it('writes a first immutable reservation and first-failure notification eligibility', () => {
  const result = executeProbeAdmission(
    'admit',
    context(),
    workspace(),
    fixtureTransport()
  );
  expect(result).toMatchObject({
    decision: 'admit-initial',
    admitted: true,
    notifyAllowed: true,
    reservationNeeded: true,
  });
  expect(
    JSON.parse(readFileSync(result.ledgerPath, 'utf8')).attempts
  ).toHaveLength(1);
  expect(statSync(result.ledgerPath).mode & 0o777).toBe(0o600);
});
it('discovers stable index then complete per-run immutable capsules and exact producer proof', () => {
  const old = capsule();
  const transport = fixtureTransport([old]);
  expect(
    executeProbeAdmission('admit', context(), workspace(), transport)
  ).toMatchObject({ decision: 'reuse-passed', admitted: false });
  expect(transport.calls[0]).toBe(
    `repos/JovieInc/Jovie/actions/artifacts?name=${old.name}&per_page=100`
  );
  expect(transport.calls).toContain(
    'repos/JovieInc/Jovie/actions/runs/100/artifacts?per_page=100'
  );
  expect(transport.calls).toContain(
    'repos/JovieInc/Jovie/actions/runs/100/attempts/1/jobs?per_page=100'
  );
});
it('uses immutable attempt-N name on rerun and never copies over the first failure', () => {
  const first = capsule(300, 1, 'failure');
  const before = JSON.stringify(first);
  const result = executeProbeAdmission(
    'admit',
    context({ runAttempt: 2 }),
    workspace(),
    fixtureTransport([first])
  );
  expect(result).toMatchObject({
    decision: 'admit-retry',
    admitted: true,
    notifyAllowed: false,
    reservationNeeded: true,
    artifactName: `${first.name}-attempt-2`,
  });
  expect(
    JSON.parse(readFileSync(result.ledgerPath, 'utf8')).attempts.map(
      row => row.runAttempt
    )
  ).toEqual([2]);
  expect(JSON.stringify(first)).toBe(before);
});
it('a failed new reservation upload cannot delete the old failure or mint an empty namespace', () => {
  const first = capsule(300, 1, 'failure');
  const remote = [first];
  const before = JSON.stringify(remote);
  const result = executeProbeAdmission(
    'admit',
    context({ runAttempt: 2 }),
    workspace(),
    fixtureTransport(remote)
  );
  expect(result.artifactName).not.toBe(first.name);
  // Simulate upload failure: immutable remote state receives no new object.
  expect(JSON.stringify(remote)).toBe(before);
  expect(
    executeProbeAdmission(
      'admit',
      context({ runId: 400 }),
      workspace(),
      fixtureTransport(remote)
    )
  ).toMatchObject({
    decision: 'admit-retry',
    failureCount: 1,
    notifyAllowed: false,
  });
});
it('final record only emits actual outcome and leaves both immutable reservations untouched', () => {
  const first = capsule(300, 1, 'failure');
  const second = capsule(300, 2, 'failure', true, true);
  const before = JSON.stringify([first, second]);
  const dir = workspace();
  const result = executeProbeAdmission(
    'record',
    context({ runAttempt: 2 }),
    dir,
    fixtureTransport([first, second])
  );
  expect(result).toMatchObject({
    decision: 'recorded',
    outcome: 'failed',
    reservationNeeded: false,
    ledgerPath: null,
  });
  expect(existsSync(join(dir, 'ledger.json'))).toBe(false);
  expect(JSON.stringify([first, second])).toBe(before);
  const finalSecond = {
    ...second,
    run: { ...second.run, status: 'completed' },
  };
  expect(
    executeProbeAdmission(
      'admit',
      context({ runId: 400 }),
      workspace(),
      fixtureTransport([first, finalSecond])
    )
  ).toMatchObject({ decision: 'defer-failures', failureCount: 2 });
});
it('existing exact current capsule does not request a duplicate artifact upload', () => {
  const current = capsule(300, 1, 'success', true);
  const result = executeProbeAdmission(
    'admit',
    context(),
    workspace(),
    fixtureTransport([current])
  );
  expect(result).toMatchObject({
    admitted: true,
    reservationNeeded: false,
    ledgerPath: null,
  });
});
it('permits first target encounter on rerun only after complete empty namespace and run index', () => {
  const transport = fixtureTransport();
  expect(
    executeProbeAdmission(
      'admit',
      context({ runAttempt: 2 }),
      workspace(),
      transport
    )
  ).toMatchObject({ admitted: true, reservationNeeded: true });
  expect(transport.calls).toContain(
    'repos/JovieInc/Jovie/actions/runs/300/artifacts?per_page=100'
  );
});
it('pending interrupted work remains unknown when completed jobs cannot prove probes', () => {
  const old = capsule();
  old.jobs = { total_count: 0, jobs: [] };
  expect(
    executeProbeAdmission(
      'admit',
      context(),
      workspace(),
      fixtureTransport([old])
    )
  ).toMatchObject({ decision: 'defer-unknown', admitted: false });
});
it.each(['truncated', 'expired', 'foreign-name', 'oversized'])(
  'rejects %s namespace metadata before ZIP download',
  kind => {
    const old = capsule();
    const { ledger, run, jobs, ...row } = old;
    if (kind === 'expired') row.expired = true;
    if (kind === 'foreign-name') row.name = 'foreign';
    if (kind === 'oversized') row.size_in_bytes = MAX_JSON_BYTES * 3;
    const transport = fixtureTransport([old], {
      index: { total_count: kind === 'truncated' ? 2 : 1, artifacts: [row] },
    });
    expect(collectProbeHistory(context(), transport).complete).toBe(false);
    expect(transport.calls.some(call => call.startsWith('zip:'))).toBe(false);
  }
);
it('refuses incomplete per-run listing and orphan suffix capsules', () => {
  const old = capsule();
  const partial = fixtureTransport([old], {
    runIndex: { total_count: 2, artifacts: [] },
  });
  expect(collectProbeHistory(context(), partial).complete).toBe(false);
  const orphan = capsule(300, 2, 'success', true, true);
  expect(
    collectProbeHistory(context({ runAttempt: 2 }), fixtureTransport([orphan]))
      .complete
  ).toBe(false);
});
it.each(['head_branch', 'head_sha', 'path', 'run_attempt', 'repository'])(
  'rejects foreign producer %s',
  field => {
    const old = capsule();
    const changed = {
      [field]:
        field === 'repository'
          ? { full_name: 'other/repo' }
          : field === 'run_attempt'
            ? 2
            : 'foreign',
    };
    expect(
      executeProbeAdmission(
        'admit',
        context(),
        workspace(),
        fixtureTransport([old], { run: changed })
      )
    ).toMatchObject({ decision: 'defer-unknown', admitted: false });
  }
);
it.each(['head_sha', 'head_branch'])(
  'does not record actual jobs with foreign %s',
  field => {
    const current = capsule(300, 1, 'success', true);
    current.jobs.jobs[0][field] = 'foreign';
    expect(
      executeProbeAdmission(
        'record',
        context(),
        workspace(),
        fixtureTransport([current])
      )
    ).toMatchObject({
      decision: 'defer-unknown',
      outcome: 'incomplete',
      ledgerPath: null,
    });
  }
);
it('skipped auth remains incomplete without any final ledger publication', () => {
  const current = capsule(300, 1, 'success', true);
  current.jobs.jobs[1].steps[0].conclusion = 'skipped';
  expect(
    executeProbeAdmission(
      'record',
      context(),
      workspace(),
      fixtureTransport([current])
    )
  ).toMatchObject({ outcome: 'incomplete', ledgerPath: null });
});
it('clock certification makes no history calls and manual does not notify duplicate failure', () => {
  const transport = fixtureTransport();
  expect(
    executeProbeAdmission(
      'admit',
      context({ mode: 'clock' }),
      workspace(),
      transport
    )
  ).toMatchObject({ decision: 'clock-bypass', admitted: false });
  expect(transport.calls).toHaveLength(0);
  expect(
    executeProbeAdmission(
      'admit',
      context({ mode: 'manual' }),
      workspace(),
      fixtureTransport()
    )
  ).toMatchObject({ admitted: true, notifyAllowed: false });
});
function binaryTransport(body, calls = []) {
  const execute = (command, args, options) => {
    if (command !== process.execPath) return spawnSync(command, args, options);
    calls.push({
      args,
      privateRoot: options.env.TMPDIR,
      stdout: options.stdio[1],
    });
    expect(args.slice(1, 9)).toEqual([
      'run',
      '--max-wait-seconds',
      '2',
      '--attempts',
      '2',
      '--',
      'gh',
      'api',
    ]);
    expect(typeof options.stdio[1]).toBe('number');
    expect(statSync(options.env.TMPDIR).mode & 0o777).toBe(0o700);
    writeFileSync(options.stdio[1], body);
    return { status: 0, stdout: null, stderr: '' };
  };
  return createGitHubTransport({ execute, temporaryRoot: workspace() });
}
it('uses wrapper binary stdout as a private real file, validates ZIP, then cleans up', () => {
  const calls = [];
  expect(
    binaryTransport(
      storedZip({ 'ledger.json': '{"proof":true}' }),
      calls
    ).getLedger('JovieInc/Jovie', 9)
  ).toEqual({ proof: true });
  expect(existsSync(calls[0].privateRoot)).toBe(false);
});
it.each([
  ['extra member', () => storedZip({ 'ledger.json': '{}', 'extra.txt': 'no' })],
  ['wrong member', () => storedZip({ '../ledger.json': '{}' })],
  ['malformed JSON', () => storedZip({ 'ledger.json': '{broken' })],
  [
    'oversized JSON',
    () => storedZip({ 'ledger.json': ' '.repeat(MAX_JSON_BYTES + 1) }),
  ],
])('rejects %s', (_label, make) =>
  expect(() => binaryTransport(make()).getLedger('JovieInc/Jovie', 9)).toThrow()
);
it.each(['admit', 'record'])(
  'quota %s is visibly unknown with exit75 and no capsule upload',
  mode => {
    const dir = workspace();
    const file = join(dir, 'context.json');
    const output = join(dir, 'github-output');
    const summary = join(dir, 'summary');
    writeFileSync(file, JSON.stringify(context()));
    const transport = createGitHubTransport({
      execute: () => ({ status: 75, stdout: '', stderr: 'quota' }),
    });
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    expect(
      main(
        [
          mode,
          '--context-file',
          file,
          '--out-dir',
          join(dir, 'out'),
          '--github-output',
          output,
        ],
        { ...process.env, GITHUB_STEP_SUMMARY: summary },
        transport
      )
    ).toBe(75);
    expect(readFileSync(output, 'utf8')).toContain('quota_deferred=true');
    expect(readFileSync(output, 'utf8')).toContain('reservation_needed=false');
    expect(existsSync(join(dir, 'out/ledger.json'))).toBe(false);
    expect(readFileSync(summary, 'utf8')).toContain('Decision: quota-deferred');
    expect(readFileSync(summary, 'utf8')).toContain('failure count: unknown');
    expect(readFileSync(summary, 'utf8')).toContain('not health certification');
    expect(readFileSync(summary, 'utf8')).toContain(context().target.sha);
  }
);
