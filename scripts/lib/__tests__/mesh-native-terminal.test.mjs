import { createHash } from 'node:crypto';
import {
  chmodSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import {
  acknowledgeDispatch,
  sealWorkOrder,
} from '../../../packages/agent-transport-contracts/work-order.ts';
import {
  assembleNativeTerminal,
  readNativeJournal,
} from '../../lanes/mesh-native-terminal.mjs';

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'mesh-native-terminal-'));
  const created = '2026-10-09T04:00:00.000Z',
    dispatched = '2026-10-09T04:00:01.000Z';
  const order = sealWorkOrder({
    schema: 'jovie.work-order/v1',
    orderId: 'future-order',
    revision: 2,
    idempotencyKey: 'future_order',
    gate: { objectiveRef: 'JOV-5853', gateId: 'repair' },
    state: 'open',
    title: 'Bounded repair',
    outcome: 'Restore current source gate',
    successPredicate: {
      id: 'qualified-source',
      statement: 'Exact source gate passes',
      verifier: 'ci',
    },
    requiredCapabilities: ['code-change'],
    riskTier: 'low',
    authorityClass: 'automation',
    scope: { target: 'JovieInc/Jovie', entityRefs: ['JOV-6001'] },
    evidence: [],
    permittedActions: ['reconcile-native-queue-starvation'],
    forbiddenActions: ['spend', 'outbound'],
    budget: {
      deadline: '2026-10-09T05:00:00.000Z',
      maxAttempts: 1,
      maxSpendUsd: 0,
      maxConcurrency: 1,
      founderMinutes: 0,
    },
    stopConditions: ['Owner unavailable'],
    escalation: { owner: 'Summer', action: 'Read current hold' },
    expectedArtifact: { kind: 'pull-request', description: 'Current source' },
    founderAsk: null,
    replyTo: { kind: 'linear-comment', ref: 'JOV-6001' },
    createdAt: created,
    createdBy: 'Summer',
  });
  const binding = {
    taskKey: 'a'.repeat(64),
    order,
    dispatchAck: acknowledgeDispatch(order, {
      transportRef: 'linear:JOV-6001',
      dispatchedAt: dispatched,
    }),
    recordedAt: dispatched,
    ownerReceiptRef: 'owner:atomic-admission',
    dispatchReceiptRef: 'owner:original-dispatch',
    dispatchAttempt: 1,
  };
  const proof = {
    taskKey: binding.taskKey,
    orderId: order.orderId,
    orderRevision: order.revision,
    orderDigest: order.digest,
    predicateId: order.successPredicate.id,
    dispatchReceiptRef: binding.dispatchReceiptRef,
    dispatchAttempt: 1,
    bindingRecordedAt: dispatched,
    dispatchedAt: dispatched,
  };
  const start = {
    schema: 'jovie-execution-attempt/v1',
    event: 'attempt_started',
    at: Date.parse(dispatched) / 1000 + 1,
    workKey: `linear-work:${'e'.repeat(64)}`,
    executionGeneration: 'b'.repeat(64),
    identityDigest: '',
    fencingToken: 'd'.repeat(64),
    attempt: 1,
    owner: {
      owner: 'original-host',
      runtime: 'symphony-lanes',
      provider: 'codex',
      model: 'verified-model',
      privateExtra: 'MUST_NOT_EXPORT',
    },
    trigger: {
      triggerId: 'future-run',
      correlationId: 'JOV-6001',
      meshBinding: proof,
    },
  };
  start.identityDigest = createHash('sha256')
    .update(
      JSON.stringify({
        generation: start.executionGeneration,
        workKey: start.workKey,
      })
    )
    .digest('hex');
  const end = {
    ...start,
    event: 'attempt_finished',
    at: start.at + 2,
    terminalState: 'succeeded',
    result: 'succeeded',
  };
  delete end.trigger;
  delete end.owner;
  const run = {
    runId: 'future-run',
    issue: 'JOV-6001',
    agentExit: 0,
    endedAt: new Date((start.at + 1) * 1000).toISOString(),
    execution: structuredClone(end),
    result: { verdict: 'held', pr: 21081, commit: 'e'.repeat(40) },
  };
  const attempt = join(dir, 'attempts.jsonl'),
    runs = join(dir, 'runs.jsonl');
  const write = () => {
    writeFileSync(
      attempt,
      JSON.stringify(start) + '\n' + JSON.stringify(end) + '\n',
      { mode: 0o600 }
    );
    writeFileSync(runs, JSON.stringify(run) + '\n', { mode: 0o600 });
  };
  write();
  const read = (policyDigest = null) => {
    write();
    const rows = readNativeJournal(attempt);
    return assembleNativeTerminal(
      binding,
      rows,
      rows,
      readNativeJournal(runs),
      Date.now(),
      policyDigest
    );
  };
  return {
    binding,
    start,
    end,
    run,
    attempt,
    runs,
    dir,
    read,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}
function qualifiedFixture() {
  const f = fixture();
  f.run.result.verdict = 'verified-not-queued';
  const run = Object.assign(f.run, {
    gateResult: {
      schema: 'jovie.lane-gate-result/v1',
      policyDigest: 'c'.repeat(64),
      verdict: 'verified-not-queued',
      pr: f.run.result.pr,
      headSha: f.run.result.commit,
      reasons: [],
      sensitive: false,
      completedAt: f.run.endedAt,
    },
  });
  return { ...f, run };
}
test('retains the exact original qualified source evaluation without certifying deployment', () => {
  const f = qualifiedFixture();
  try {
    const r = f.read('c'.repeat(64));
    expect(r.original.sourceEvaluation).toEqual({
      ...r.original.run,
      pr: f.run.result.pr,
      head: f.run.result.commit,
      qualified: true,
      evaluatedAt: f.run.gateResult.completedAt,
    });
    expect(r.original.sourceEvaluation.receiptDigest).toBe(
      createHash('sha256')
        .update(JSON.stringify(f.run) + '\n')
        .digest('hex')
    );
    expect(r.independentOutcome).toBe('unknown');
    expect(r.certification).toBe('uncertified');
  } finally {
    f.cleanup();
  }
});
test.each([
  ['missing gate', f => delete f.run.gateResult],
  ['legacy gate', f => (f.run.gateResult.schema = 'legacy')],
  ['stale policy', f => (f.run.gateResult.policyDigest = 'f'.repeat(64))],
  ['held native run', f => (f.run.result.verdict = 'held')],
  ['held source', f => (f.run.gateResult.verdict = 'held')],
  ['wrong PR', f => f.run.gateResult.pr++],
  ['missing PR', f => Object.assign(f.run.gateResult, { pr: null })],
  ['wrong head', f => (f.run.gateResult.headSha = 'f'.repeat(40))],
  ['missing sensitivity', f => delete f.run.gateResult.sensitive],
  ['failed source assertion', f => (f.run.gateResult.reasons = ['failed'])],
  ['missing assertions', f => delete f.run.gateResult.reasons],
  ['malformed time', f => (f.run.gateResult.completedAt = 'not-a-time')],
  [
    'preexisting gate',
    f => (f.run.gateResult.completedAt = f.binding.order.createdAt),
  ],
  [
    'gate after terminal',
    f => (f.run.gateResult.completedAt = '2026-10-09T04:00:10.000Z'),
  ],
])('%s is not a qualified original source receipt', (_, change) => {
  const f = qualifiedFixture();
  try {
    change(f);
    expect(f.read('c'.repeat(64)).original.sourceEvaluation).toBeNull();
  } finally {
    f.cleanup();
  }
});
test('unconfigured installed policy never certifies source from a gate-shaped object', () => {
  const f = qualifiedFixture();
  try {
    expect(f.read().original.sourceEvaluation).toBeNull();
  } finally {
    f.cleanup();
  }
});
test('joins original attempt bytes without converting held native success into delivery', () => {
  const f = fixture();
  try {
    const r = f.read();
    expect(r.execution.runId).toBe('future-run');
    expect(r.execution.terminalDisposition).toBe('succeeded');
    expect(r.original.dispatch.receiptDigest).toBe(
      createHash('sha256')
        .update(JSON.stringify(f.start) + '\n')
        .digest('hex')
    );
    expect(r.original.terminal.attemptId).toBe(f.start.fencingToken);
    expect(r.sourceEvaluation).toEqual({
      verdict: 'held',
      pr: 21081,
      head: 'e'.repeat(40),
    });
    expect(r.original.sourceEvaluation).toBeNull();
    expect(r.independentOutcome).toBe('unknown');
    expect(r.certification).toBe('uncertified');
    expect(r.execution.owner).not.toHaveProperty('privateExtra');
  } finally {
    f.cleanup();
  }
});
test.each([
  ['historical unbound run', f => delete f.start.trigger.meshBinding],
  ['foreign task', f => (f.start.trigger.meshBinding.taskKey = 'f'.repeat(64))],
  [
    'wrong order',
    f => (f.start.trigger.meshBinding.orderDigest = 'f'.repeat(64)),
  ],
  ['late binding', f => (f.binding.recordedAt = '2026-10-09T06:00:00.000Z')],
  ['wrong attempt', f => (f.end.attempt = 2)],
  ['wrong fence', f => (f.run.execution.fencingToken = 'f'.repeat(64))],
  ['foreign run', f => (f.run.runId = 'other')],
  ['foreign issue', f => (f.run.issue = 'JOV-6002')],
  ['unfinished attempt', f => (f.end.terminalState = null)],
  ['missing PR knowledge', f => delete f.run.result.pr],
  ['invalid source head', f => (f.run.result.commit = 'invalid')],
  ['missing owner', f => delete f.start.owner],
  ['not native owner', f => (f.start.owner.runtime = 'dispatch')],
  ['early end', f => (f.end.at = f.start.at - 1)],
  ['old run end', f => (f.run.endedAt = '2026-10-09T03:00:00.000Z')],
  ['missing run end', f => (f.run.endedAt = 'invalid')],
  ['missing result', f => delete f.run.result],
  ['missing verdict', f => delete f.run.result.verdict],
  ['malformed attempt identity', f => (f.start.identityDigest = 'invalid')],
  [
    'inconsistent native identity',
    f => {
      for (const row of [f.start, f.end, f.run.execution])
        row.identityDigest = 'c'.repeat(64);
    },
  ],
  ['malformed generation', f => (f.start.executionGeneration = 'invalid')],
  ['malformed fence', f => (f.start.fencingToken = 'invalid')],
  ['malformed dispatch attempt', f => (f.binding.dispatchAttempt = 0)],
  [
    'wrong dispatch transport',
    f => (f.binding.dispatchAck.transportRef = 'linear:JOV-6002'),
  ],
  ['changed run execution', f => (f.run.execution.result = 'failed_unknown')],
])('fails closed on %s', (_name, mutate) => {
  const f = fixture();
  try {
    mutate(f);
    expect(() => f.read()).toThrow();
  } finally {
    f.cleanup();
  }
});

test('preserves supported delayed coordinator completion with a trusted observation bound', () => {
  const f = fixture();
  try {
    f.run.endedAt = new Date((f.end.at + 60) * 1000).toISOString();
    expect(f.read().execution.terminalDisposition).toBe('succeeded');
    const rows = readNativeJournal(f.attempt);
    const runs = readNativeJournal(f.runs);
    expect(() =>
      assembleNativeTerminal(f.binding, rows, rows, runs, f.end.at * 1000)
    ).toThrow();
    expect(() =>
      assembleNativeTerminal(f.binding, rows, rows, runs, Number.NaN)
    ).toThrow();
  } finally {
    f.cleanup();
  }
});

test('rejects changes to reader-returned original bytes and digest selectors', () => {
  const f = fixture();
  try {
    for (const change of [
      row => {
        row.row.owner.model = 'substituted-model';
      },
      row => {
        row.receiptDigest = 'f'.repeat(64);
        row.receiptRef = `other#sha256:${row.receiptDigest}`;
      },
    ]) {
      const rows = readNativeJournal(f.attempt);
      const runs = readNativeJournal(f.runs);
      change(rows[0]);
      expect(() =>
        assembleNativeTerminal(f.binding, rows, rows, runs)
      ).toThrow();
    }
  } finally {
    f.cleanup();
  }
});

test('rejects substituted original receipt selectors without reconstructing them', () => {
  const f = fixture();
  try {
    const rows = readNativeJournal(f.attempt);
    const runs = readNativeJournal(f.runs);
    for (const bad of [
      { ...rows[0], receiptDigest: 'invalid' },
      { ...rows[0], receiptRef: 'other-owner:receipt' },
      { ...rows[0], receiptRef: 'x'.repeat(513) },
    ])
      expect(() =>
        assembleNativeTerminal(f.binding, [bad], rows, runs)
      ).toThrow('mesh-native-terminal-unproved');
  } finally {
    f.cleanup();
  }
});
test('preserves native failure despite agent exit zero and tolerates coordinator transport metadata', () => {
  const f = fixture();
  try {
    f.end.terminalState = 'failed_unknown';
    f.end.result = 'failed_unknown';
    f.run.execution = structuredClone(f.end);
    Object.assign(f.end, {
      _remote: { statusId: 123, eventId: 'original', prevStatusId: 122 },
    });
    f.run.result = { verdict: 'failed', commit: null, pr: null };
    const r = f.read();
    expect(r.execution.terminalDisposition).toBe('failed_unknown');
    expect(r.sourceEvaluation.pr).toBeNull();
  } finally {
    f.cleanup();
  }
});
test('rejects duplicate or incomplete original journals without an absence claim', () => {
  const f = fixture();
  try {
    const rows = readNativeJournal(f.attempt),
      runs = readNativeJournal(f.runs);
    expect(() =>
      assembleNativeTerminal(f.binding, [...rows, rows[0]], rows, runs)
    ).toThrow();
    expect(() =>
      assembleNativeTerminal(f.binding, rows, [...rows, rows[1]], runs)
    ).toThrow();
    expect(() =>
      assembleNativeTerminal(f.binding, rows, rows, [...runs, ...runs])
    ).toThrow();
    writeFileSync(f.attempt, '{}');
    expect(() => readNativeJournal(f.attempt)).toThrow();
    writeFileSync(f.attempt, 'invalid\n');
    expect(() => readNativeJournal(f.attempt)).toThrow();
    expect(() => readNativeJournal(f.runs, 1)).toThrow();
    expect(() => readNativeJournal('relative')).toThrow();
    expect(() => readNativeJournal(f.runs, NaN)).toThrow();
    chmodSync(f.runs, 0o666);
    expect(() => readNativeJournal(f.runs)).toThrow();
    const link = join(f.dir, 'link');
    symlinkSync(f.runs, link);
    expect(() => readNativeJournal(link)).toThrow();
  } finally {
    f.cleanup();
  }
});
