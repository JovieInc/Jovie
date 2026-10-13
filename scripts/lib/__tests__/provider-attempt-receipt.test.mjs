import { describe, expect, it } from 'vitest';
import {
  authorizeProviderAttemptContinuation,
  bindProviderAttempt,
  PROVIDER_REQUEST_REPLAY_REFUSAL,
  recordProviderAttemptAdmissionReconciliation,
  recordProviderAttemptGuardRefusal,
  recordProviderAttemptOutcome,
  verifyProviderAttemptReceipt,
} from '../../../packages/agent-transport-contracts/provider-attempt-receipt.ts';

/**
 * @typedef {import('../../../packages/agent-transport-contracts/provider-attempt-receipt.ts').ProviderAttemptBindInput} ProviderAttemptBindInput
 * @typedef {import('../../../packages/agent-transport-contracts/provider-attempt-receipt.ts').ProviderAttemptOutcome} ProviderAttemptOutcome
 */

const SOURCE_OWNER = 'symphony-adhoc-task:01a11430-fc9d-7586-aabb-61bd5b6a303b';
const ADMISSION_RECEIPT_ID = 'c'.repeat(64);

/** @returns {ProviderAttemptBindInput['binding']} */
const binding = () => ({
  parentWrunId: 'wrun_41M4C8XBQ60GMHFDEYF9W49CKQ',
  attemptWrunId: 'wrun_41M4D2MFMF0GNF3C3BZ94599Z5',
  parentDeploymentId: 'dpl_4EohkUp2L3j9k6GGFb1y5ovzPWtq',
  attemptDeploymentId: 'dpl_HZVa8o52DQWvZsr4wTpcKesQQ28U',
  turnIndex: 12,
  stepIndex: 3,
});

/** @returns {ProviderAttemptBindInput} */
const attempt = () => ({
  sourceOwner: SOURCE_OWNER,
  binding: binding(),
  providerRequest: {
    requestId: 'preq_fixture_01a11430',
    requestDigest: 'a'.repeat(64),
    provider: 'provider-gateway',
    model: 'provider/model-version',
    route: 'turnstep-provider-fallback',
    evidenceRef: 'record://eve/turnstep/request/preq_fixture_01a11430',
  },
  firstFailure: {
    observedAt: '2026-10-08T06:19:58.000Z',
    errorClass: 'transient_provider',
    errorId: 'provider-error-fixture',
    errorCode: 'GatewayTimeoutError',
    errorDigest: 'b'.repeat(64),
    httpStatus: 504,
    evidenceRef: 'record://eve/turnstep/error/provider-error-fixture',
  },
});

/** @returns {ProviderAttemptOutcome} */
const outcome = () => ({
  completed: false,
  completedAt: null,
  reconciledAt: '2026-10-08T06:21:30.000Z',
  usage: {
    status: 'reported',
    inputTokens: 41_230,
    outputTokens: 812,
    cacheTokens: null,
  },
  claim: 'recorded',
  charge: 'accrued',
  evidenceRef: 'record://eve/turnstep/outcome/preq_fixture_01a11430',
});

const guarded = () =>
  recordProviderAttemptGuardRefusal(bindProviderAttempt(attempt()), {
    errorId: '2bab698a-c39a-4482-8a63-ee4b99fa022f',
    observedAt: '2026-10-08T06:21:21.000Z',
  });

const reconciled = () =>
  recordProviderAttemptAdmissionReconciliation(
    recordProviderAttemptOutcome(guarded(), outcome()),
    {
      receiptId: ADMISSION_RECEIPT_ID,
      returnedAt: '2026-10-08T06:21:40.000Z',
      evidenceRef: `record://handoff/${ADMISSION_RECEIPT_ID}`,
    }
  );

describe('provider attempt reconciliation receipt (JOV-8030)', () => {
  it('binds the original request and failure to exact execution identity', () => {
    const receipt = bindProviderAttempt(attempt());
    expect(receipt.schema).toBe('jovie.provider-attempt-receipt/v1');
    expect(receipt.sourceOwner).toBe(SOURCE_OWNER);
    expect(receipt.sourceOwnerPreserved).toBe(true);
    expect(receipt.receiptId).toMatch(/^[a-f0-9]{64}$/u);
    expect(receipt.idempotencyKey).toBe(
      `provider-attempt:${receipt.receiptId}`
    );
    expect(receipt.binding).toEqual(binding());
    expect(receipt.providerRequest).toEqual(attempt().providerRequest);
    expect(receipt.firstFailure).toEqual(attempt().firstFailure);
    expect(receipt.guardRefusal).toBeNull();
    expect(receipt.outcome).toBeNull();
    expect(receipt.admission).toBeNull();
    expect(receipt.continuation).toBeNull();
    expect(verifyProviderAttemptReceipt(receipt)).toEqual(receipt);
  });

  it('keeps the first failure distinct from the replay guard refusal', () => {
    const bound = bindProviderAttempt(attempt());
    const receipt = recordProviderAttemptGuardRefusal(bound, {
      errorId: '2bab698a-c39a-4482-8a63-ee4b99fa022f',
      observedAt: '2026-10-08T06:21:21.000Z',
    });
    expect(receipt.guardRefusal).toEqual({
      code: PROVIDER_REQUEST_REPLAY_REFUSAL,
      errorId: '2bab698a-c39a-4482-8a63-ee4b99fa022f',
      observedAt: '2026-10-08T06:21:21.000Z',
    });
    expect(receipt.firstFailure.errorCode).toBe('GatewayTimeoutError');
    expect(
      recordProviderAttemptGuardRefusal(receipt, {
        errorId: '2bab698a-c39a-4482-8a63-ee4b99fa022f',
        observedAt: '2026-10-08T06:21:21.000Z',
      })
    ).toEqual(receipt);
    expect(() =>
      recordProviderAttemptGuardRefusal(receipt, {
        errorId: 'different-guard-error',
        observedAt: '2026-10-08T06:21:22.000Z',
      })
    ).toThrow('conflicts');
    expect(() =>
      recordProviderAttemptGuardRefusal(bound, {
        errorId: '2bab698a-c39a-4482-8a63-ee4b99fa022f',
        observedAt: '2026-10-08T06:19:00.000Z',
      })
    ).toThrow('cannot precede the first failure');
  });

  it('preserves partial usage, claims, and charges without replay', () => {
    const bound = bindProviderAttempt(attempt());
    const receipt = recordProviderAttemptOutcome(bound, outcome());
    expect(receipt.outcome).toMatchObject({
      completed: false,
      claim: 'recorded',
      charge: 'accrued',
      usage: {
        status: 'reported',
        inputTokens: 41_230,
        outputTokens: 812,
      },
    });
    expect(recordProviderAttemptOutcome(receipt, outcome())).toEqual(receipt);
    expect(() =>
      recordProviderAttemptOutcome(receipt, {
        ...outcome(),
        charge: 'unknown',
      })
    ).toThrow('conflicts');

    const completed = recordProviderAttemptOutcome(bound, {
      ...outcome(),
      completed: true,
      completedAt: '2026-10-08T06:20:41.000Z',
      usage: { status: 'none' },
      claim: 'none',
      charge: 'none',
    });
    expect(completed.outcome).toMatchObject({
      completed: true,
      usage: { status: 'none' },
    });
    expect(() =>
      recordProviderAttemptOutcome(bound, {
        ...outcome(),
        completed: true,
        completedAt: null,
      })
    ).toThrow('must agree');
    expect(() =>
      recordProviderAttemptOutcome(bound, {
        ...outcome(),
        reconciledAt: '2026-10-08T06:18:00.000Z',
      })
    ).toThrow('cannot predate first failure');
  });

  it('requires the exact persisted admission before same-session continuation', () => {
    const bound = bindProviderAttempt(attempt());
    expect(() =>
      authorizeProviderAttemptContinuation(bound, {
        authorizedAt: '2026-10-08T06:22:00.000Z',
      })
    ).toThrow('replay guard must reconcile');

    const withGuard = guarded();
    expect(() =>
      authorizeProviderAttemptContinuation(withGuard, {
        authorizedAt: '2026-10-08T06:22:00.000Z',
      })
    ).toThrow('outcome must reconcile');

    const withOutcome = recordProviderAttemptOutcome(withGuard, outcome());
    expect(() =>
      authorizeProviderAttemptContinuation(withOutcome, {
        authorizedAt: '2026-10-08T06:22:00.000Z',
      })
    ).toThrow('server-side admission must reconcile');

    const admission = recordProviderAttemptAdmissionReconciliation(
      withOutcome,
      {
        receiptId: ADMISSION_RECEIPT_ID,
        returnedAt: '2026-10-08T06:21:40.000Z',
        evidenceRef: `record://handoff/${ADMISSION_RECEIPT_ID}`,
      }
    );
    expect(
      recordProviderAttemptAdmissionReconciliation(admission, {
        receiptId: ADMISSION_RECEIPT_ID,
        returnedAt: '2026-10-08T06:21:40.000Z',
        evidenceRef: `record://handoff/${ADMISSION_RECEIPT_ID}`,
      })
    ).toEqual(admission);
    expect(() =>
      recordProviderAttemptAdmissionReconciliation(admission, {
        receiptId: 'd'.repeat(64),
        returnedAt: '2026-10-08T06:21:41.000Z',
        evidenceRef: `record://handoff/${'d'.repeat(64)}`,
      })
    ).toThrow('conflicts');

    const receipt = authorizeProviderAttemptContinuation(admission, {
      authorizedAt: '2026-10-08T06:22:00.000Z',
    });
    expect(receipt.continuation).toEqual({
      action: 'resume-preserved-state',
      admissionReceiptId: ADMISSION_RECEIPT_ID,
      sessionStatePreserved: true,
      replayProtectionPreserved: true,
      freshAdmission: false,
      paidReplay: false,
      renewedTrial: false,
      ownershipReset: false,
      secondWriter: false,
      authorizedAt: '2026-10-08T06:22:00.000Z',
    });
    expect(
      authorizeProviderAttemptContinuation(receipt, {
        authorizedAt: '2026-10-08T06:22:00.000Z',
      })
    ).toEqual(receipt);
    expect(() =>
      authorizeProviderAttemptContinuation(receipt, {
        authorizedAt: '2026-10-08T06:23:00.000Z',
      })
    ).toThrow('conflicts');
    expect(() =>
      authorizeProviderAttemptContinuation(admission, {
        authorizedAt: '2026-10-08T06:21:35.000Z',
      })
    ).toThrow('cannot predate reconciliation');
  });

  it('rejects malformed chronology and unreconciled continuation projections', () => {
    const withGuard = guarded();
    expect(() =>
      verifyProviderAttemptReceipt({
        ...withGuard,
        guardRefusal: {
          ...withGuard.guardRefusal,
          observedAt: '2026-10-08T06:19:00.000Z',
        },
      })
    ).toThrow('guard refusal cannot precede');

    const withOutcome = recordProviderAttemptOutcome(withGuard, outcome());
    expect(() =>
      verifyProviderAttemptReceipt({
        ...withOutcome,
        outcome: {
          ...withOutcome.outcome,
          completedAt: '2026-10-08T06:20:41.000Z',
        },
      })
    ).toThrow('must agree');
    expect(() =>
      verifyProviderAttemptReceipt({
        ...withOutcome,
        outcome: {
          ...withOutcome.outcome,
          reconciledAt: '2026-10-08T06:19:00.000Z',
        },
      })
    ).toThrow('outcome cannot predate');
    expect(() =>
      recordProviderAttemptAdmissionReconciliation(withOutcome, {
        receiptId: ADMISSION_RECEIPT_ID,
        returnedAt: '2026-10-08T06:19:00.000Z',
        evidenceRef: `record://handoff/${ADMISSION_RECEIPT_ID}`,
      })
    ).toThrow('admission reconciliation cannot predate');

    const withAdmission = reconciled();
    expect(() =>
      verifyProviderAttemptReceipt({
        ...withAdmission,
        admission: {
          ...withAdmission.admission,
          returnedAt: '2026-10-08T06:19:00.000Z',
        },
      })
    ).toThrow('admission reconciliation cannot predate');

    const continued = authorizeProviderAttemptContinuation(withAdmission, {
      authorizedAt: '2026-10-08T06:22:00.000Z',
    });
    expect(() =>
      verifyProviderAttemptReceipt({ ...continued, admission: null })
    ).toThrow('continuation is unreconciled');
    expect(() =>
      verifyProviderAttemptReceipt({
        ...continued,
        continuation: {
          ...continued.continuation,
          authorizedAt: '2026-10-08T06:21:35.000Z',
        },
      })
    ).toThrow('continuation cannot predate');
  });

  it('rejects tampered, replayed, or differently-bound receipts', () => {
    const receipt = bindProviderAttempt(attempt());
    expect(() =>
      verifyProviderAttemptReceipt({ ...receipt, version: 99 })
    ).toThrow('digest is invalid');
    expect(() =>
      verifyProviderAttemptReceipt({
        ...receipt,
        binding: { ...receipt.binding, stepIndex: 4 },
      })
    ).toThrow('identity is invalid');
    expect(() =>
      verifyProviderAttemptReceipt({
        ...receipt,
        providerRequest: {
          ...receipt.providerRequest,
          requestDigest: 'f'.repeat(64),
        },
      })
    ).toThrow('identity is invalid');
    expect(() =>
      bindProviderAttempt({
        ...attempt(),
        binding: { ...binding(), stepIndex: -1 },
      })
    ).toThrow();
    expect(() =>
      bindProviderAttempt({
        ...attempt(),
        binding: { ...binding(), parentWrunId: 'session_x' },
      })
    ).toThrow();
    expect(() =>
      bindProviderAttempt({
        ...attempt(),
        firstFailure: {
          ...attempt().firstFailure,
          observedAt: 'not-a-time',
        },
      })
    ).toThrow();
    expect(verifyProviderAttemptReceipt(reconciled())).toEqual(reconciled());
  });
});
