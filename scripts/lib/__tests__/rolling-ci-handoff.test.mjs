import { describe, expect, it } from 'vitest';
import {
  claimSingleWriter,
  FX_ADAPTER_NAME,
  FX_AUTH_MISSING_FAILURE,
  FX_BACKSTOP_FAILURES,
  FX_HANDOFF_FAILURE,
  fxBackstopRoute,
  fxConfigurationIncident,
  HANDOFF_SCHEMA,
  isImplementerLeaseLive,
  parseHandoffReceipt,
  receiptMarker,
  resolveFxAdapter,
  resolveRemediationRoute,
  resolveWebhookFxRoute,
  supersedeOwnership,
  validateHandoffReceipt,
  writerClaimKey,
} from '../rolling-ci-handoff.mjs';

const head = 'a'.repeat(40);
const nextHead = 'b'.repeat(40);
const identity = {
  repository: 'JovieInc/Jovie',
  pr: 16337,
  head,
  fingerprint: 'ci:policy-liveness',
};
const active = {
  schema: HANDOFF_SCHEMA,
  pr: 16337,
  head,
  status: 'active',
  leaseExpiresAt: '2026-08-22T03:00:00Z',
  acceptanceCriteria: ['exact-head green'],
  remainingChecks: ['ci-fast'],
  failureFingerprints: ['ci:policy-liveness'],
  remediationOwner: 'implementer',
};
const fxAdapter = { name: FX_ADAPTER_NAME, authConfigured: true };

describe('rolling CI ownership and FX backstop', () => {
  it('routes to a live implementer without requiring FX auth', () => {
    expect(
      resolveRemediationRoute({
        receipt: active,
        liveHead: head,
        implementer: 'tim',
        fxAdapter: { name: FX_ADAPTER_NAME, authConfigured: false },
        now: '2026-08-22T01:00:00Z',
      })
    ).toEqual({ route: 'implementer', writer: 'implementer' });
  });

  it('keeps implementer ownership when no handoff receipt exists', () => {
    expect(
      resolveRemediationRoute({
        liveHead: head,
        implementer: 'tim',
        fxAdapter,
      })
    ).toEqual({ route: 'implementer', writer: 'tim' });
  });

  it('routes an explicit handoff to the configured FX backstop', () => {
    expect(
      resolveRemediationRoute({
        receipt: { ...active, status: 'handed-off' },
        liveHead: head,
        implementer: 'tim',
        fxAdapter,
      })
    ).toEqual({
      route: 'fx',
      writer: FX_ADAPTER_NAME,
      failure: FX_HANDOFF_FAILURE,
    });
  });

  it('routes abandonment to FX only after the explicit receipt', () => {
    expect(
      resolveRemediationRoute({
        receipt: { ...active, status: 'abandoned' },
        liveHead: head,
        implementer: 'tim',
        fxAdapter,
      })
    ).toMatchObject({ route: 'fx', writer: FX_ADAPTER_NAME });
  });

  it('surfaces missing FX auth only after handoff or abandonment', () => {
    expect(
      resolveRemediationRoute({
        receipt: { ...active, status: 'abandoned' },
        liveHead: head,
        implementer: 'tim',
        fxAdapter: { name: FX_ADAPTER_NAME, authConfigured: false },
      })
    ).toMatchObject({
      route: 'configuration_incident',
      writer: null,
      incident: { type: 'fx_auth_missing', failure: FX_AUTH_MISSING_FAILURE },
    });
  });

  it('does not block implementer-owned repair when FX auth is missing', () => {
    const route = resolveRemediationRoute({
      receipt: active,
      liveHead: head,
      implementer: 'tim',
      fxAdapter: { name: '', authConfigured: false },
      now: '2026-08-22T01:00:00Z',
    });
    expect(route).toEqual({ route: 'implementer', writer: 'implementer' });
    expect(resolveFxAdapter({ name: '', authConfigured: false })).toEqual({
      name: null,
      authConfigured: false,
    });
  });

  it('rejects a stale handoff before assigning any writer', () => {
    expect(
      resolveRemediationRoute({
        receipt: active,
        liveHead: nextHead,
        implementer: 'tim',
        fxAdapter,
      })
    ).toMatchObject({ route: 'reject_invalid_handoff', writer: null });
  });

  it('treats an expired implementer lease as abandonment for FX routing', () => {
    expect(
      validateHandoffReceipt(active, {
        liveHead: head,
        now: '2026-08-22T04:00:00Z',
      }).errors
    ).toContain('implementer lease is expired');
    expect(
      resolveRemediationRoute({
        receipt: active,
        liveHead: head,
        implementer: 'tim',
        fxAdapter,
        now: '2026-08-22T04:00:00Z',
      })
    ).toMatchObject({ route: 'fx', writer: FX_ADAPTER_NAME });
  });

  it('round trips the machine-readable handoff marker', () => {
    expect(
      parseHandoffReceipt(receiptMarker('jovie-rolling-ci-handoff', active))
    ).toEqual(active);
  });

  it('enforces one writer per PR/root cause under competing deliveries', () => {
    const first = claimSingleWriter({
      writer: 'implementer',
      identity,
      liveHead: head,
    });
    expect(first.action).toBe('claim');
    expect(first.claim.writer).toBe('implementer');
    expect(first.claim.key).toBe(writerClaimKey(identity));

    const competing = claimSingleWriter({
      existingClaim: first.claim,
      writer: FX_ADAPTER_NAME,
      identity,
      liveHead: head,
    });
    expect(competing).toMatchObject({
      action: 'reject_competing_writer',
      writer: 'implementer',
      claim: first.claim,
    });

    expect(
      claimSingleWriter({
        existingClaim: first.claim,
        writer: 'implementer',
        identity,
        liveHead: head,
      }).action
    ).toBe('claim');
  });

  it('cancels obsolete ownership on a new commit or green rerun', () => {
    const claimed = claimSingleWriter({
      writer: 'implementer',
      identity,
      liveHead: head,
    }).claim;

    expect(
      claimSingleWriter({
        existingClaim: claimed,
        writer: FX_ADAPTER_NAME,
        identity: { ...identity, head: nextHead },
        liveHead: nextHead,
      })
    ).toMatchObject({
      action: 'supersede_stale_head',
      claim: { writer: FX_ADAPTER_NAME, head: nextHead },
    });

    expect(
      supersedeOwnership({
        reason: 'new-commit',
        liveHead: nextHead,
        claim: claimed,
      })
    ).toEqual({ action: 'supersede_stale_head', claim: null });

    expect(
      supersedeOwnership({
        reason: 'green-rerun',
        liveHead: head,
        claim: claimed,
      })
    ).toEqual({ action: 'supersede_repairs_green', claim: null });
  });

  it('treats a missing or expired lease as not live for webhook FX launch', () => {
    expect(isImplementerLeaseLive(null)).toBe(false);
    expect(
      isImplementerLeaseLive(active, {
        liveHead: head,
        now: '2026-08-22T01:00:00Z',
      })
    ).toBe(true);
    expect(
      isImplementerLeaseLive(active, {
        liveHead: head,
        now: '2026-08-22T04:00:00Z',
      })
    ).toBe(false);
    expect(
      resolveWebhookFxRoute({
        liveHead: head,
        implementer: 'tim',
        fxAdapter,
      })
    ).toMatchObject({ route: 'fx', writer: FX_ADAPTER_NAME, launch: true });
    expect(
      resolveWebhookFxRoute({
        receipt: active,
        liveHead: head,
        implementer: 'tim',
        fxAdapter,
        now: '2026-08-22T01:00:00Z',
      })
    ).toMatchObject({
      route: 'implementer',
      writer: 'implementer',
      launch: false,
    });
  });

  it('maps FX backstop failures without inventing a second owner', () => {
    expect(FX_BACKSTOP_FAILURES[FX_HANDOFF_FAILURE]).toEqual({
      owner: 'fx',
      action: 'repair-current-pr-exact-head',
    });
    expect(FX_BACKSTOP_FAILURES[FX_AUTH_MISSING_FAILURE]).toEqual({
      owner: 'gem',
      action: 'restore-fx-adapter-authentication',
    });
    expect(fxBackstopRoute('fx')).toBe('gem-to-fx');
    expect(fxBackstopRoute('gem')).toBe('gem-local');
    expect(fxConfigurationIncident().owner).toBe('CI Platform');
  });
});
