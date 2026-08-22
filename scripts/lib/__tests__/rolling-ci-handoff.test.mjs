import { describe, expect, it } from 'vitest';
import {
  HANDOFF_SCHEMA,
  LEARNING_SCHEMA,
  parseHandoffReceipt,
  receiptMarker,
  resolveRemediationRoute,
  rollingCiLoopComplete,
  validateLearningReceipt,
} from '../rolling-ci-handoff.mjs';

const head = 'a'.repeat(40);
const active = {
  schema: HANDOFF_SCHEMA,
  pr: 17,
  head,
  status: 'active',
  leaseExpiresAt: '2026-08-22T03:00:00Z',
  acceptanceCriteria: ['exact-head green'],
  remainingChecks: ['ci-fast'],
  failureFingerprints: [],
  remediationOwner: 'implementer',
};

const learning = {
  schema: LEARNING_SCHEMA,
  head,
  failureClass: 'product',
  rootCauseClass: 'policy-liveness',
  currentHeadReproduction: 'publication blocked before PR creation',
  minimalRepair: 'scan changed files without cloning history',
  equivalentSurfaceSweep: 'all pre-publication hooks inspected',
  deliberateRedFixture: 'CI evidence required before draft fixture',
  guardrail: {
    warranted: true,
    delivery: 'same-pr',
    testFailsBefore: true,
    testPassesAfter: true,
  },
  exactHeadGreen: true,
};

describe('rolling CI ownership and learning receipts', () => {
  it('routes to a live implementer without requiring FX auth', () => {
    expect(
      resolveRemediationRoute({
        receipt: active,
        liveHead: head,
        implementer: 'tim',
        fxAdapter: { name: 'fx', authConfigured: false },
        now: '2026-08-22T01:00:00Z',
      })
    ).toEqual({ route: 'implementer', writer: 'implementer' });
  });

  it('routes an explicit handoff to the configured FX backstop', () => {
    expect(
      resolveRemediationRoute({
        receipt: { ...active, status: 'handed-off' },
        liveHead: head,
        implementer: 'tim',
        fxAdapter: { name: 'fx', authConfigured: true },
      })
    ).toEqual({ route: 'fx', writer: 'fx' });
  });

  it('surfaces missing FX auth only after handoff or abandonment', () => {
    expect(
      resolveRemediationRoute({
        receipt: { ...active, status: 'abandoned' },
        liveHead: head,
        implementer: 'tim',
        fxAdapter: { name: 'fx', authConfigured: false },
      })
    ).toMatchObject({
      route: 'configuration_incident',
      incident: { type: 'fx_auth_missing' },
    });
  });

  it('rejects a stale handoff before assigning any writer', () => {
    expect(
      resolveRemediationRoute({
        receipt: active,
        liveHead: 'b'.repeat(40),
        implementer: 'tim',
      })
    ).toMatchObject({ route: 'reject_invalid_handoff', writer: null });
  });

  it('round trips the machine-readable handoff marker', () => {
    expect(
      parseHandoffReceipt(receiptMarker('jovie-rolling-ci-handoff', active))
    ).toEqual(active);
  });

  it('requires durable defect-class proof before loop completion', () => {
    expect(rollingCiLoopComplete({ receipt: learning, liveHead: head })).toBe(
      true
    );
    expect(
      validateLearningReceipt(
        { ...learning, equivalentSurfaceSweep: '' },
        { liveHead: head }
      ).errors
    ).toContain('equivalentSurfaceSweep is required');
  });

  it('classifies environment failures without product-rule sprawl', () => {
    expect(
      validateLearningReceipt({
        ...learning,
        failureClass: 'environment',
        guardrail: { ...learning.guardrail, warranted: true },
      }).errors
    ).toContain(
      'environment and one-off failures cannot create product guardrails'
    );
    expect(
      validateLearningReceipt({
        ...learning,
        failureClass: 'environment',
        guardrail: { warranted: false },
      }).ok
    ).toBe(true);
  });
});
