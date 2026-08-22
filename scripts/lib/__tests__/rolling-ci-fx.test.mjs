import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  normalizeFailureEvents,
  runDispatch,
  TRUSTED_CI_WORKFLOW_PATH,
} from '../rolling-ci-dispatch.mjs';
import {
  findOwnedAgents,
  planFxLaunch,
  planFxWebhookRemediation,
  resolveDispatchWriter,
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
});
