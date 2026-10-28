import { beforeEach, describe, expect, it, vi } from 'vitest';
// The single validator lives in scripts/lib; the web builder must pass it.
import { validateOpsHealth } from '../../../../../../scripts/lib/ops-health.mjs';

vi.mock('server-only', () => ({}));

const SHA = 'b'.repeat(40);
const build = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
}));

vi.mock('@/lib/observability/build-info', () => ({
  getDeployedBuildInfo: async () => build.value,
}));

describe('getOpsHealthEnvelope', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.OPS_SERVICE;
  });

  it('emits a valid ops.health/v1 body for a known build', async () => {
    build.value = {
      commitSha: SHA,
      environment: 'production',
      version: '26.10.16',
      deployedAt: '2026-10-28T11:00:00.000Z',
    };
    const { getOpsHealthEnvelope } = await import(
      '@/lib/observability/ops-health'
    );
    const body = await getOpsHealthEnvelope();
    expect(body.service).toBe('jovie-web');
    expect(body.status).toBe('up');
    expect(validateOpsHealth(body)).toEqual({ ok: true, errors: [] });
  });

  it('reports unknown, not up, when the commit is unknown, and honours OPS_SERVICE', async () => {
    process.env.OPS_SERVICE = 'ovie';
    build.value = {
      commitSha: undefined,
      environment: undefined,
      version: '26.10.16',
      deployedAt: null,
    };
    const { getOpsHealthEnvelope } = await import(
      '@/lib/observability/ops-health'
    );
    const body = await getOpsHealthEnvelope();
    expect(body.service).toBe('ovie');
    expect(body.status).toBe('unknown');
    expect(body.commitSha).toBeNull();
    expect(body.deployedAt).toBeNull();
    expect(validateOpsHealth(body).ok).toBe(true);
  });
});
