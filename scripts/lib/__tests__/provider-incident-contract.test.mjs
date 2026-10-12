import { describe, expect, it } from 'vitest';
import {
  ingestProviderFailure,
  normalizeProviderFailure,
  PROVIDER_INCIDENT_MAX_RETRIES,
  recordProviderIncidentAction,
  recordProviderIncidentRetry,
  recordProviderPathVerification,
  verifyProviderIncidentHandoff,
} from '../../../packages/agent-transport-contracts/provider-incident.ts';

const baseline = (path, observedAt = '2026-08-04T16:55:00.000Z') => ({
  state: 'healthy',
  observedAt,
  evidenceRef: `record://provider-health/${path}`,
});

const failure = (path, error, observedAt) => ({
  path,
  error,
  observedAt,
  baseline: baseline(path),
});

describe('shared Summer/Zoe provider incident contract', () => {
  it('deduplicates different Gateway wrappers without retaining secrets or message content', () => {
    const summer = failure(
      'summer-imessage',
      Object.assign(
        new Error('503 for user message private words and key sk-live-secret'),
        { name: 'GatewayInternalServerError', statusCode: 503 }
      ),
      '2026-08-04T17:00:00.000Z'
    );
    const zoe = failure(
      'zoe',
      {
        error: {
          type: 'provider_unavailable',
          message: 'temporarily overloaded while processing another secret',
        },
        response: { status: 503 },
      },
      '2026-08-04T17:00:03.000Z'
    );

    const first = ingestProviderFailure(null, summer);
    const receipt = ingestProviderFailure(first, zoe);
    expect(receipt.incidentFingerprint).toBe(first.incidentFingerprint);
    expect(receipt.idempotencyKey).toBe(first.idempotencyKey);
    expect(receipt.owner).toBe('provider-incident-controller');
    expect(receipt.failure).toMatchObject({
      provider: 'vercel-ai-gateway',
      accountBoundary: 'shared-ai-gateway',
      errorClass: 'transient_provider',
      occurrenceCount: 2,
      affectedPaths: ['summer-imessage', 'zoe'],
      httpStatuses: [503],
    });
    expect(receipt.failure.baselines.map(row => row.path)).toEqual([
      'summer-imessage',
      'zoe',
    ]);
    const serialized = JSON.stringify(receipt);
    for (const secret of [
      'private words',
      'sk-live-secret',
      'another secret',
    ]) {
      expect(serialized).not.toContain(secret);
    }

    expect(ingestProviderFailure(receipt, zoe)).toEqual(receipt);
    expect(() =>
      ingestProviderFailure(
        receipt,
        failure(
          'zoe',
          Object.assign(new Error('Unauthorized'), { statusCode: 401 }),
          '2026-08-04T17:01:00.000Z'
        )
      )
    ).toThrow('different incident');
  });

  it('normalizes nested, serialized, malformed, array, and primitive provider errors safely', () => {
    const cases = [
      [
        new Error(
          JSON.stringify({
            errors: [
              { status: 503 },
              { statusCode: 502, message: 'service unavailable' },
            ],
          })
        ),
        'transient_provider',
        [502, 503],
      ],
      ['[{malformed', 'unknown', []],
      [[null, 7, { code: 'unsupported' }], 'permanent_request', []],
      [undefined, 'unknown', []],
    ];
    for (const [error, errorClass, httpStatuses] of cases) {
      expect(
        normalizeProviderFailure(
          failure('zoe', error, '2026-08-04T17:00:00.000Z')
        )
      ).toMatchObject({ errorClass, httpStatuses });
    }
    expect(() =>
      normalizeProviderFailure({
        ...failure('zoe', new Error('unavailable'), '2026-08-04T17:00:00.000Z'),
        baseline: {
          ...baseline('zoe'),
          evidenceRef: 'https://health.example.test/probe?token=secret',
        },
      })
    ).toThrow();
  });

  it('shares one bounded retry budget and denies retries for non-transient failures', () => {
    let receipt = ingestProviderFailure(
      null,
      failure(
        'summer-imessage',
        Object.assign(new Error('rate limited'), { statusCode: 429 }),
        '2026-08-04T17:00:00.000Z'
      )
    );
    expect(receipt.retryPolicy).toMatchObject({
      transient: true,
      maxAttempts: PROVIDER_INCIDENT_MAX_RETRIES,
      attempts: [],
    });
    receipt = recordProviderIncidentRetry(receipt, {
      retryId: 'gateway-retry-001',
      path: 'summer-imessage',
      outcome: 'failed',
      completedAt: '2026-08-04T17:00:05.000Z',
      evidenceRef: 'record://provider-retry/001',
    });
    receipt = recordProviderIncidentRetry(receipt, {
      retryId: 'gateway-retry-002',
      path: 'zoe',
      outcome: 'recovered',
      completedAt: '2026-08-04T17:00:10.000Z',
      evidenceRef: 'record://provider-retry/002',
    });
    const sameRetry = recordProviderIncidentRetry(receipt, {
      retryId: 'gateway-retry-002',
      path: 'zoe',
      outcome: 'recovered',
      completedAt: '2026-08-04T17:00:10.000Z',
      evidenceRef: 'record://provider-retry/002',
    });
    expect(sameRetry).toEqual(receipt);
    expect(() =>
      recordProviderIncidentRetry(receipt, {
        retryId: 'gateway-retry-002',
        path: 'zoe',
        outcome: 'failed',
        completedAt: '2026-08-04T17:00:10.000Z',
        evidenceRef: 'record://provider-retry/002',
      })
    ).toThrow('conflicts');
    expect(receipt.retryPolicy.attempts.map(row => row.attempt)).toEqual([
      1, 2,
    ]);
    expect(() =>
      recordProviderIncidentRetry(receipt, {
        retryId: 'gateway-retry-003',
        path: 'zoe',
        outcome: 'failed',
        completedAt: '2026-08-04T17:00:15.000Z',
        evidenceRef: 'record://provider-retry/003',
      })
    ).toThrow('budget exhausted');

    const permanent = ingestProviderFailure(
      null,
      failure(
        'zoe',
        Object.assign(new Error('model not found'), { statusCode: 404 }),
        '2026-08-04T17:02:00.000Z'
      )
    );
    expect(permanent.retryPolicy).toMatchObject({
      transient: false,
      maxAttempts: 0,
    });
    expect(permanent.escalation).toEqual({ required: false, reason: null });
    expect(() =>
      recordProviderIncidentRetry(permanent, {
        retryId: 'gateway-retry-004',
        path: 'zoe',
        outcome: 'failed',
        completedAt: '2026-08-04T17:02:05.000Z',
        evidenceRef: 'record://provider-retry/004',
      })
    ).toThrow('retry denied');
  });

  it.each([
    [
      Object.assign(new Error('invalid api key'), { statusCode: 401 }),
      'credentials',
    ],
    [
      Object.assign(new Error('positive credit balance required'), {
        statusCode: 402,
      }),
      'spend',
    ],
    [Object.assign(new Error('forbidden'), { statusCode: 403 }), 'permissions'],
  ])('escalates only authority-bound failures (%s)', (error, reason) => {
    const receipt = ingestProviderFailure(
      null,
      failure('zoe', error, '2026-08-04T17:03:00.000Z')
    );
    expect(receipt.retryPolicy.maxAttempts).toBe(0);
    expect(receipt.escalation).toEqual({ required: true, reason });
    expect(receipt.nextOwner).toBe('human-authority');
  });

  it('escalates an explicit human decision and rejects unrelated authority actions', () => {
    const receipt = ingestProviderFailure(null, {
      ...failure('zoe', new Error('ambiguous'), '2026-08-04T17:03:00.000Z'),
      humanDecisionRequired: true,
    });
    expect(receipt.failure.errorClass).toBe('human_decision');
    expect(receipt.escalation).toEqual({
      required: true,
      reason: 'human_decision',
    });
    expect(() =>
      recordProviderIncidentAction(receipt, {
        kind: 'spend_authorization',
        completedAt: '2026-08-04T17:04:00.000Z',
        evidenceRef: 'record://provider-action/not-spend',
      })
    ).toThrow('does not match');
    expect(() =>
      recordProviderIncidentAction(receipt, {
        kind: 'classified',
        completedAt: '2026-08-04T17:04:00.000Z',
        evidenceRef: 'record://provider-action/classified',
      })
    ).toThrow('not a remediation action');
  });

  it('retains the earliest and latest safe observations across out-of-order intake', () => {
    let receipt = ingestProviderFailure(
      null,
      failure(
        'summer-imessage',
        Object.assign(new Error('unavailable'), { statusCode: 503 }),
        '2026-08-04T17:00:10.000Z'
      )
    );
    receipt = ingestProviderFailure(
      receipt,
      failure(
        'zoe',
        Object.assign(new Error('unavailable'), { statusCode: 502 }),
        '2026-08-04T17:00:00.000Z'
      )
    );
    expect(receipt.failure).toMatchObject({
      firstObservedAt: '2026-08-04T17:00:00.000Z',
      lastObservedAt: '2026-08-04T17:00:10.000Z',
      httpStatuses: [502, 503],
    });
  });

  it('requires independent Summer iMessage and Zoe verification before recovery', () => {
    let receipt = ingestProviderFailure(
      null,
      failure(
        'summer-imessage',
        Object.assign(new Error('service unavailable'), { statusCode: 503 }),
        '2026-08-04T17:00:00.000Z'
      )
    );
    receipt = ingestProviderFailure(
      receipt,
      failure(
        'zoe',
        Object.assign(new Error('gateway internal'), { statusCode: 503 }),
        '2026-08-04T17:00:01.000Z'
      )
    );
    receipt = recordProviderIncidentAction(receipt, {
      kind: 'provider_health_check',
      completedAt: '2026-08-04T17:05:00.000Z',
      evidenceRef: 'record://provider-health/remediation-001',
    });
    receipt = recordProviderPathVerification(receipt, {
      path: 'summer-imessage',
      status: 'passed',
      checkedAt: '2026-08-04T17:06:00.000Z',
      evidenceRef: 'record://provider-verification/summer-imessage',
    });
    expect(receipt.afterState).toBe('verifying');
    expect(receipt.nextOwner).toBe('provider-incident-controller');
    expect(
      recordProviderPathVerification(receipt, {
        path: 'summer-imessage',
        status: 'passed',
        checkedAt: '2026-08-04T17:06:00.000Z',
        evidenceRef: 'record://provider-verification/summer-imessage',
      })
    ).toEqual(receipt);
    receipt = recordProviderPathVerification(receipt, {
      path: 'zoe',
      status: 'passed',
      checkedAt: '2026-08-04T17:06:05.000Z',
      evidenceRef: 'record://provider-verification/zoe',
    });
    expect(receipt).toMatchObject({
      action: { kind: 'provider_health_check' },
      afterState: 'recovered',
      nextOwner: 'none',
      rollback: {
        layer: 'provider-incident-dedupe-notification',
        action: 'disable-layer',
        providerRoutingChanged: false,
      },
      verification: {
        'summer-imessage': { status: 'passed' },
        zoe: { status: 'passed' },
      },
    });
    expect(verifyProviderIncidentHandoff(receipt)).toEqual(receipt);

    expect(() =>
      verifyProviderIncidentHandoff({
        ...receipt,
        afterState: 'failed',
      })
    ).toThrow();
    expect(() =>
      verifyProviderIncidentHandoff({
        ...receipt,
        incidentFingerprint: '0'.repeat(64),
      })
    ).toThrow('identity');
    expect(() =>
      verifyProviderIncidentHandoff({
        ...receipt,
        retryPolicy: { ...receipt.retryPolicy, maxAttempts: 0 },
      })
    ).toThrow();
    expect(() =>
      verifyProviderIncidentHandoff({
        ...receipt,
        failure: {
          ...receipt.failure,
          occurrenceCount: receipt.failure.occurrenceCount + 1,
        },
      })
    ).toThrow('evidence');
    expect(() =>
      verifyProviderIncidentHandoff({
        ...receipt,
        contentDigest: '0'.repeat(64),
      })
    ).toThrow('digest');
  });

  it('keeps a failed path in remediation instead of claiming recovery', () => {
    let receipt = ingestProviderFailure(
      null,
      failure(
        'summer-imessage',
        Object.assign(new Error('unavailable'), { statusCode: 503 }),
        '2026-08-04T17:00:00.000Z'
      )
    );
    receipt = recordProviderPathVerification(receipt, {
      path: 'summer-imessage',
      status: 'failed',
      checkedAt: '2026-08-04T17:05:00.000Z',
      evidenceRef: 'record://provider-verification/summer-failed',
    });
    expect(receipt.afterState).toBe('remediation_required');
    expect(receipt.nextOwner).toBe('provider-incident-controller');
    expect(receipt.action.kind).toBe('provider_health_check');
  });
});
