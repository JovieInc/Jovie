import { describe, expect, it } from 'vitest';
import {
  createToolRouteReceipt,
  finishToolRouteReceipt,
  isBenchmarkRouteEligible,
  type ToolRouteEvent,
  type ToolRoutePolicy,
  toolRouteReceiptSchema,
} from './tool-route';

const policy: ToolRoutePolicy = {
  mode: 'controlled_benchmark',
  allowedTransports: ['mcp'],
  allowedTools: ['fleet.register'],
  requireRouteAttestation: true,
};
const mcp: ToolRouteEvent = {
  boundary: 'sandbox',
  transport: 'mcp',
  toolId: 'fleet.register',
  executable: null,
  destinationHost: 'jov.ie',
  credentialClass: 'scoped',
};
type Evidence = Parameters<typeof createToolRouteReceipt>[0];
const evidence: Evidence = {
  schema: 'jovie.tool-route-receipt/v1',
  runRef: `sha256:${'a'.repeat(64)}`,
  workflowId: 'fleet.register',
  requestedRuntime: 'codex-cli',
  actualRuntime: 'codex-cli',
  requestedTransport: 'mcp',
  policy,
  catalogVersion: 'fixture.v1',
  schemaPayloadBytes: 100,
  startedAt: '2026-10-15T12:00:00.000Z',
  completedAt: '2026-10-15T12:00:01.000Z',
  status: 'succeeded',
  idempotencyKeyRef: null,
  verifierReceiptRef: `sha256:${'b'.repeat(64)}`,
  observationComplete: true,
  isolation: 'capability',
  events: [mcp],
};

function make(patch: Partial<Evidence> = {}) {
  return createToolRouteReceipt({ ...evidence, ...patch });
}
function valid(value: unknown) {
  return toolRouteReceiptSchema.safeParse(value).success;
}

describe('host-observed tool route receipts', () => {
  it('admits only a successful completely attested isolated benchmark', () => {
    const receipt = make();
    expect(receipt.policyDecision).toBe('allow');
    expect(isBenchmarkRouteEligible(receipt)).toBe(true);
    expect(make({ verifierReceiptRef: null }).benchmarkEligible).toBe(false);
    const failed = finishToolRouteReceipt(
      receipt,
      'failed',
      evidence.completedAt
    );
    expect(failed.benchmarkEligible).toBe(false);
    expect(failed.verifierReceiptRef).toBe(receipt.verifierReceiptRef);
  });

  it('detects and excludes mixed MCP plus shell even when both are allowed', () => {
    const receipt = make({
      requestedTransport: null,
      policy: {
        ...policy,
        allowedTransports: ['mcp', 'shell'],
        allowedTools: ['fleet.register', 'shell'],
      },
      events: [mcp, { ...mcp, transport: 'shell', toolId: 'shell' }],
    });
    expect(receipt).toMatchObject({
      mixedRoute: true,
      bypassDetected: false,
      policyDecision: 'deny',
    });
    expect(
      isBenchmarkRouteEligible({
        ...receipt,
        mixedRoute: false,
        benchmarkEligible: true,
      })
    ).toBe(false);
  });

  it('denies direct HTTP bypass and undeclared tools in each controlled mode', () => {
    for (const mode of ['controlled_benchmark', 'policy_bound'] as const) {
      for (const event of [
        { ...mcp, transport: 'direct_http' as const },
        { ...mcp, toolId: 'undeclared.tool' },
      ]) {
        const receipt = make({
          policy: { ...policy, mode },
          events: [event],
        });
        expect(receipt).toMatchObject({
          bypassDetected: true,
          policyDecision: 'deny',
          benchmarkEligible: false,
        });
      }
    }
  });

  it('denies missing observation, empty catalogs and prompt-only enforcement', () => {
    for (const override of [
      { observationComplete: false },
      { events: [] },
      { actualRuntime: null },
      { actualRuntime: 'unknown' },
      { actualRuntime: 'claude-code' },
      { isolation: 'none' as const },
      { policy: { ...policy, allowedTransports: [], allowedTools: [] } },
      {
        observationComplete: false,
        policy: { ...policy, requireRouteAttestation: false },
      },
    ]) {
      expect(make(override)).toMatchObject({
        policyDecision: 'deny',
        benchmarkEligible: false,
      });
    }
    const observed = make({
      isolation: 'none',
      observationComplete: false,
      policy: { ...policy, mode: 'observe' },
      events: [{ ...mcp, transport: 'direct_http' }],
    });
    expect(observed).toMatchObject({
      unknownRoute: true,
      bypassDetected: true,
      policyDecision: 'report_only',
      benchmarkEligible: false,
    });
  });

  it('rejects secret-bearing fields and destination URLs rather than persisting them', () => {
    const receipt = make();
    for (const key of ['args', 'headers', 'token', 'otp', 'payload', 'env']) {
      expect(
        valid({
          ...receipt,
          [key]: 'canary-private-value',
        })
      ).toBe(false);
      expect(
        valid({
          ...receipt,
          events: [{ ...mcp, [key]: 'canary-private-value' }],
        })
      ).toBe(false);
    }
    for (const destinationHost of [
      'https://jov.ie/?token=canary',
      'user:password@jov.ie',
      'jov.ie/private-path',
    ]) {
      expect(
        valid({
          ...receipt,
          events: [{ ...mcp, destinationHost }],
        })
      ).toBe(false);
    }
    expect(
      valid({
        ...receipt,
        completedAt: '2026-10-14T12:00:00.000Z',
      })
    ).toBe(false);
  });
});
