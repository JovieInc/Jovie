import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  normalizeFailureEvents,
  runDispatch,
  TRUSTED_CI_WORKFLOW_PATH,
} from '../rolling-ci-dispatch.mjs';
import {
  classifyRunnerFailure,
  FX_RUNNER_IDEMPOTENCY_KEY,
  findOwnedAgents,
  planFxLaunch,
  planFxWebhookRemediation,
  resolveDispatchWriter,
  resolveFxNamedOutcome,
  resolveWebhookRemediationRoute,
} from '../rolling-ci-fx.mjs';
import {
  FX_ADAPTER_NAME,
  FX_HANDOFF_FAILURE,
  HANDOFF_SCHEMA,
  receiptMarker,
  resolveRemediationRoute,
} from '../rolling-ci-handoff.mjs';

const head = 'a'.repeat(40);
const CLI = resolve(import.meta.dirname, '..', 'rolling-ci-fx.mjs');
const trustedSource = {
  eventName: 'workflow_run',
  workflow: 'CI',
  producerEvent: 'pull_request',
  trustedPolicyRef: 'main',
  workflowPath: TRUSTED_CI_WORKFLOW_PATH,
};
const fxAdapter = { name: FX_ADAPTER_NAME, authConfigured: true };
const activeReceipt = {
  schema: HANDOFF_SCHEMA,
  pr: 17,
  head,
  status: 'active',
  leaseExpiresAt: '2026-08-22T03:00:00Z',
  acceptanceCriteria: ['exact-head green'],
  remainingChecks: ['ci-fast'],
  failureFingerprints: ['ci:policy-liveness'],
  remediationOwner: 'implementer',
};

function dispatch(overrides = {}) {
  return runDispatch({
    repository: 'JovieInc/Jovie',
    prNumber: 17,
    headSha: head,
    liveHead: head,
    workflowRunId: 9001,
    workflowRunAttempt: 1,
    failedJobs: [{ name: 'ci-fast', steps: ['Typecheck'] }],
    source: trustedSource,
    checkSuiteId: 44,
    checks: [
      {
        name: 'ci-fast',
        conclusion: 'failure',
        headSha: head,
        checkSuiteId: 44,
      },
    ],
    writer: 'tim',
    priorCommentBody: '',
    conclusion: 'failure',
    ...overrides,
  });
}

describe('rolling CI FX webhook remediation', () => {
  it('keeps pickup-end implementer routing when no handoff receipt exists', () => {
    expect(
      resolveRemediationRoute({
        receipt: null,
        liveHead: head,
        implementer: 'tim',
        fxAdapter,
      })
    ).toEqual({ route: 'implementer', writer: 'tim' });
  });

  it('routes webhook ingress to FX when no handoff receipt exists', () => {
    expect(
      resolveWebhookRemediationRoute({
        receipt: null,
        liveHead: head,
        implementer: 'tim',
        fxAdapter,
      })
    ).toMatchObject({
      route: 'fx',
      writer: FX_ADAPTER_NAME,
      failure: FX_HANDOFF_FAILURE,
      reason: 'no_handoff_receipt',
    });
  });

  it('holds FX when the implementer lease is still live', () => {
    expect(
      resolveWebhookRemediationRoute({
        receipt: activeReceipt,
        liveHead: head,
        implementer: 'tim',
        fxAdapter,
        now: '2026-08-22T01:00:00Z',
      })
    ).toMatchObject({
      route: 'implementer',
      writer: 'implementer',
      reason: 'implementer_lease_live',
    });
    expect(
      planFxWebhookRemediation({
        dispatch: dispatch(),
        receipt: activeReceipt,
        liveHead: head,
        implementer: 'tim',
        fxAdapter,
        cursorApiKey: 'cursor-key',
        now: '2026-08-22T01:00:00Z',
      }).launch
    ).toMatchObject({ action: 'skip', reason: 'implementer_lease_live' });
  });

  it('fails closed when FX auth is missing on the webhook path', () => {
    expect(
      resolveWebhookRemediationRoute({
        receipt: null,
        liveHead: head,
        implementer: 'tim',
        fxAdapter: { name: FX_ADAPTER_NAME, authConfigured: false },
      })
    ).toMatchObject({
      route: 'configuration_incident',
      reason: 'fx-auth-missing',
    });
  });

  it('launches Cursor-direct repair for a failed merge_group against the source PR', () => {
    const planned = planFxWebhookRemediation({
      dispatch: dispatch({
        writer: FX_ADAPTER_NAME,
        source: { ...trustedSource, producerEvent: 'merge_group' },
      }),
      receipt: null,
      liveHead: head,
      implementer: 'tim',
      fxAdapter,
      cursorApiKey: 'cursor-key',
      repository: 'JovieInc/Jovie',
      prNumber: 16180,
      headSha: head,
      sourceHead: 'b'.repeat(40),
      headRef: 'cursor/arbitrary-values-fix',
    });
    expect(planned.launch.action).toBe('launch');
    expect(planned.launch.request.target.autoCreatePr).toBe(false);
    expect(planned.launch.request.source.ref).toBe(
      'cursor/arbitrary-values-fix'
    );
    expect(planned.launch.request.prompt.text).toContain(
      'native merge_group CI failure'
    );
    expect(planned.launch.request.prompt.text).toContain('PR: #16180');
    expect(planned.launch.request.prompt.text).toContain(
      'Do not waive ratchet growth'
    );
  });

  it('launches FX for a failed merge_group CI run on the source PR branch', () => {
    const queueSha = 'c'.repeat(40);
    const planned = planFxWebhookRemediation({
      dispatch: dispatch({
        writer: FX_ADAPTER_NAME,
        source: { ...trustedSource, producerEvent: 'merge_group' },
        headSha: queueSha,
        liveHead: queueSha,
        checks: [
          {
            name: 'ci-fast',
            conclusion: 'failure',
            headSha: queueSha,
            checkSuiteId: 44,
          },
        ],
      }),
      receipt: null,
      liveHead: queueSha,
      implementer: 'tim',
      fxAdapter,
      cursorApiKey: 'cursor-key',
      repository: 'JovieInc/Jovie',
      prNumber: 16180,
      headSha: queueSha,
      sourceHead: 'b'.repeat(40),
      headRef: 'cursor/fx-merge-group-remediator-7038',
    });
    expect(planned.dispatch.action).toBe('dispatch_implementer');
    expect(planned.launch.action).toBe('launch');
    expect(planned.launch.request.source.ref).toBe(
      'cursor/fx-merge-group-remediator-7038'
    );
    expect(planned.launch.request.target.autoCreatePr).toBe(false);
    expect(planned.launch.request.prompt.text).toContain(
      'native merge_group CI failure'
    );
  });

  it('launches Cursor-direct repair against the current PR without a sibling PR', () => {
    const planned = planFxWebhookRemediation({
      dispatch: dispatch({ writer: FX_ADAPTER_NAME }),
      receipt: null,
      liveHead: head,
      implementer: 'tim',
      fxAdapter,
      cursorApiKey: 'cursor-key',
      repository: 'JovieInc/Jovie',
      prNumber: 17,
      headSha: head,
      headRef: 'cursor/fx-ci-cache-gc-aee1',
    });
    expect(planned.launch.action).toBe('launch');
    expect(planned.launch.request.target.autoCreatePr).toBe(false);
    expect(planned.launch.request.source.ref).toBe(
      'cursor/fx-ci-cache-gc-aee1'
    );
    expect(planned.launch.request.prompt.text).toContain(head);
  });

  it('deduplicates when a Cursor agent already owns the fingerprint', () => {
    const events = normalizeFailureEvents({
      repository: 'JovieInc/Jovie',
      prNumber: 17,
      headSha: head,
      workflowRunId: 9001,
      workflowRunAttempt: 1,
      failedJobs: [{ name: 'ci-fast', steps: ['Typecheck'] }],
      source: trustedSource,
      checkSuiteId: 44,
    });
    expect(
      planFxLaunch({
        repository: 'JovieInc/Jovie',
        prNumber: 17,
        headSha: head,
        fingerprint: events[0].fingerprint,
        cursorAgents: [{ id: 'agent-1', prompt: events[0].fingerprint }],
        cursorApiKey: 'cursor-key',
      })
    ).toMatchObject({
      action: 'dedup',
      reason: 'agent_already_owns_fingerprint',
      existingAgentIds: ['agent-1'],
    });
    expect(
      findOwnedAgents([{ id: 'agent-1', prompt: 'nope' }], 'ci:abc')
    ).toEqual([]);
  });

  it('does not steal a live implementer comment claim when dispatching', () => {
    expect(
      resolveDispatchWriter({
        route: { route: 'fx', writer: FX_ADAPTER_NAME },
        priorClaimWriter: 'tim',
        implementer: 'tim',
      })
    ).toBe('tim');
  });

  it('uses the source PR author when present, else FX on blank merge_group LIVE_AUTHOR', () => {
    expect(
      resolveDispatchWriter({
        route: { route: 'fx', writer: FX_ADAPTER_NAME },
        implementer: 'tim',
      })
    ).toBe('tim');
    expect(
      resolveDispatchWriter({
        route: { route: 'fx', writer: FX_ADAPTER_NAME },
        implementer: '',
      })
    ).toBe(FX_ADAPTER_NAME);
    expect(
      resolveDispatchWriter({
        route: { route: 'configuration_incident', writer: null },
        implementer: '   ',
      })
    ).toBe(FX_ADAPTER_NAME);
    expect(
      resolveDispatchWriter({
        route: { route: 'configuration_incident', writer: null },
        implementer: 'tim',
      })
    ).toBe('tim');
    expect(
      resolveDispatchWriter({
        route: { route: 'implementer', writer: '' },
        implementer: '',
      })
    ).toBe(FX_ADAPTER_NAME);
  });

  it('plans merge_group FX launch when LIVE_AUTHOR is empty', () => {
    const input = {
      repository: 'JovieInc/Jovie',
      prNumber: 16418,
      headSha: head,
      liveHead: head,
      sourceHead: 'b'.repeat(40),
      headRef: 'cursor/measured-merge-group',
      workflowRunId: 32621638955,
      workflowRunAttempt: 1,
      failedJobs: [{ name: 'ci-fast', steps: ['Typecheck'] }],
      source: { ...trustedSource, producerEvent: 'merge_group' },
      checkSuiteId: 44,
      checks: [
        {
          name: 'ci-fast',
          conclusion: 'failure',
          headSha: head,
          checkSuiteId: 44,
        },
      ],
      writer: '',
      priorCommentBody: '',
      conclusion: 'failure',
      cursorApiKey: 'cursor-key',
      listCursorAgents: false,
    };
    const launched = spawnSync(process.execPath, [CLI], {
      input: JSON.stringify(input),
      encoding: 'utf8',
    });
    expect(launched.status).toBe(0);
    expect(launched.stderr).not.toContain('writer is required');
    const planned = JSON.parse(launched.stdout);
    expect(planned).toMatchObject({
      route: { route: 'fx' },
      launch: { action: 'launch' },
      dispatch: { mutate: true, action: 'dispatch_implementer' },
      outcome: 'launched',
    });
    expect(planned.dispatch.state.claim.writer).toBe(FX_ADAPTER_NAME);

    const missingAuth = spawnSync(process.execPath, [CLI], {
      input: JSON.stringify({ ...input, cursorApiKey: '' }),
      encoding: 'utf8',
    });
    expect(missingAuth.status).toBe(0);
    expect(missingAuth.stderr).not.toContain('writer is required');
    expect(JSON.parse(missingAuth.stdout)).toMatchObject({
      route: { route: 'configuration_incident' },
      launch: { action: 'configuration_incident' },
      dispatch: { mutate: true },
      outcome: 'no_key',
    });
  });

  it('CLI plans an FX launch from a trusted failure event', () => {
    const input = {
      repository: 'JovieInc/Jovie',
      prNumber: 17,
      headSha: head,
      liveHead: head,
      headRef: 'fix/ci',
      workflowRunId: 9001,
      workflowRunAttempt: 1,
      failedJobs: [{ name: 'ci-fast', steps: ['Typecheck'] }],
      source: trustedSource,
      checkSuiteId: 44,
      checks: [
        {
          name: 'ci-fast',
          conclusion: 'failure',
          headSha: head,
          checkSuiteId: 44,
        },
      ],
      writer: 'tim',
      priorCommentBody: '',
      conclusion: 'failure',
      cursorApiKey: 'cursor-key',
      listCursorAgents: false,
    };
    const launched = spawnSync(process.execPath, [CLI], {
      input: JSON.stringify(input),
      encoding: 'utf8',
    });
    expect(launched.status).toBe(0);
    expect(JSON.parse(launched.stdout)).toMatchObject({
      route: { route: 'fx' },
      launch: { action: 'launch' },
      dispatch: { mutate: true },
    });
    const held = spawnSync(process.execPath, [CLI], {
      input: JSON.stringify({
        ...input,
        handoffCommentBody: receiptMarker(
          'jovie-rolling-ci-handoff',
          activeReceipt
        ),
        now: '2026-08-22T01:00:00Z',
      }),
      encoding: 'utf8',
    });
    expect(held.status).toBe(0);
    expect(JSON.parse(held.stdout).launch).toMatchObject({
      action: 'skip',
      reason: 'implementer_lease_live',
    });
  });

  it('classifies checkout, infra, and flake separately from product failures', () => {
    expect(
      classifyRunnerFailure([
        { name: 'ci-fast', steps: ['Checkout exact PR head'] },
      ])
    ).toBe('checkout');
    expect(
      classifyRunnerFailure([
        { name: 'ci-fast', conclusion: 'startup_failure', steps: [] },
      ])
    ).toBe('infra');
    expect(
      classifyRunnerFailure([{ name: 'ci-fast', steps: ['flake retry'] }])
    ).toBe('flake');
    expect(
      classifyRunnerFailure([{ name: 'ci-fast', steps: ['Typecheck'] }])
    ).toBeNull();
    expect(resolveFxNamedOutcome({ launch: { action: 'launch' } })).toBe(
      'launched'
    );
    expect(
      resolveFxNamedOutcome({
        launch: { action: 'configuration_incident', reason: 'fx-auth-missing' },
      })
    ).toBe('no_key');
  });

  it('launches FX for checkout failures even while an implementer lease is live', () => {
    const checkoutJobs = [
      { name: 'ci-fast', steps: ['Checkout exact PR head'] },
    ];
    const planned = planFxWebhookRemediation({
      dispatch: dispatch({ failedJobs: checkoutJobs }),
      receipt: activeReceipt,
      liveHead: head,
      implementer: 'tim',
      fxAdapter,
      cursorApiKey: 'cursor-key',
      now: '2026-08-22T01:00:00Z',
      failedJobs: checkoutJobs,
    });
    expect(planned.launch.action).toBe('launch');
    expect(planned.runnerClass).toBe('checkout');
    expect(planned.outcome).toBe('launched');
    expect(planned.launch.request.prompt.text).toContain(
      'Runner-class failure'
    );
    expect(planned.launch.request.prompt.text).toContain(
      FX_RUNNER_IDEMPOTENCY_KEY
    );
    expect(planned.launch.request.prompt.text).toContain(
      'Do not change product tests or weaken gates'
    );
  });

  it('CLI launches FX for checkout failures when LIVE_AUTHOR is empty', () => {
    const input = {
      repository: 'JovieInc/Jovie',
      prNumber: 17,
      headSha: head,
      liveHead: head,
      headRef: 'fix/ci',
      workflowRunId: 9001,
      workflowRunAttempt: 1,
      failedJobs: [{ name: 'ci-fast', steps: ['Checkout exact PR head'] }],
      source: trustedSource,
      checkSuiteId: 44,
      checks: [
        {
          name: 'ci-fast',
          conclusion: 'failure',
          headSha: head,
          checkSuiteId: 44,
        },
      ],
      writer: '',
      priorCommentBody: '',
      conclusion: 'failure',
      cursorApiKey: 'cursor-key',
      listCursorAgents: false,
    };
    const launched = spawnSync(process.execPath, [CLI], {
      input: JSON.stringify(input),
      encoding: 'utf8',
    });
    expect(launched.status).toBe(0);
    expect(launched.stderr).not.toContain('writer is required');
    expect(JSON.parse(launched.stdout)).toMatchObject({
      launch: { action: 'launch' },
      outcome: 'launched',
      runnerClass: 'checkout',
      dispatch: { mutate: true },
    });
    expect(JSON.parse(launched.stdout).dispatch.state.claim.writer).toBe(
      FX_ADAPTER_NAME
    );

    const heldCheckout = spawnSync(process.execPath, [CLI], {
      input: JSON.stringify({
        ...input,
        writer: 'tim',
        handoffCommentBody: receiptMarker(
          'jovie-rolling-ci-handoff',
          activeReceipt
        ),
        now: '2026-08-22T01:00:00Z',
      }),
      encoding: 'utf8',
    });
    expect(heldCheckout.status).toBe(0);
    expect(heldCheckout.stderr).not.toContain('writer is required');
    expect(JSON.parse(heldCheckout.stdout)).toMatchObject({
      launch: { action: 'launch' },
      outcome: 'launched',
      runnerClass: 'checkout',
    });
  });
});
