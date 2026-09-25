import { afterEach, describe, expect, it, vi } from 'vitest';
import { SUMMER_PRODUCTION } from './summer-production-identity';
import {
  resetSummerProductionPinCache,
  resolveSummerEveCallerOrigin,
  SummerPinInvalidError,
} from './summer-production-pin';

const ORIGIN = 'https://jovie-eve-shadow-abc123-jovie.vercel.app';
const ID = 'dpl_pinned123';
const alias = SUMMER_PRODUCTION.productionOrigin;

function identity(overrides: Record<string, unknown> = {}) {
  return {
    id: SUMMER_PRODUCTION.serviceId,
    projectId: SUMMER_PRODUCTION.projectId,
    environment: 'production',
    deploymentId: ID,
    blobAuth: 'oidc',
    ...overrides,
  };
}

function installFetch(body: () => Response) {
  return vi.fn<typeof fetch>(async () => body());
}

describe('resolveSummerEveCallerOrigin', () => {
  afterEach(() => {
    resetSummerProductionPinCache();
    vi.restoreAllMocks();
  });

  it('uses the alias silently when the pin is absent or matches', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const unpinned = installFetch(() =>
      Response.json(identity({ deploymentId: 'dpl_live' }))
    );
    await expect(
      resolveSummerEveCallerOrigin({ fetchImpl: unpinned })
    ).resolves.toEqual({ origin: alias, deploymentId: 'dpl_live' });
    expect(String(unpinned.mock.calls[0]?.[0])).toBe(
      `${alias}/runtime/v1/identity`
    );
    const matched = installFetch(() => Response.json(identity()));
    await expect(
      resolveSummerEveCallerOrigin({
        pinnedOrigin: ORIGIN,
        pinnedDeploymentId: ID,
        fetchImpl: matched,
      })
    ).resolves.toEqual({ origin: alias, deploymentId: ID });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('logs a stale or malicious pin and still returns the alias', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const stderr = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    const stale = installFetch(() =>
      Response.json(identity({ deploymentId: 'dpl_promoted' }))
    );
    await expect(
      resolveSummerEveCallerOrigin({
        pinnedOrigin: ORIGIN,
        pinnedDeploymentId: ID,
        fetchImpl: stale,
      })
    ).resolves.toEqual({ origin: alias, deploymentId: 'dpl_promoted' });
    const logged = errorSpy.mock.calls[0]?.[0] as {
      event?: string;
      observed?: { fallback?: string; deploymentId?: string };
    };
    expect(logged.event).toBe('summer_pin_invalid');
    expect(logged.observed).toMatchObject({
      fallback: 'production_alias',
      deploymentId: 'dpl_promoted',
    });
    expect(String(stderr.mock.calls[0]?.[0])).toContain('production_alias');
    expect(String(stale.mock.calls[0]?.[0])).not.toContain('jovie-eve-shadow');
    const evil = installFetch(() =>
      Response.json(identity({ deploymentId: 'dpl_live' }))
    );
    await resolveSummerEveCallerOrigin({
      pinnedOrigin: 'https://evil.example.com',
      pinnedDeploymentId: 'dpl_evil',
      fetchImpl: evil,
    });
    expect(String(evil.mock.calls[0]?.[0])).toBe(
      `${alias}/runtime/v1/identity`
    );
  });

  it('fails closed without caching a bad alias, and memoizes a good one', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let reads = 0;
    const failing = vi.fn<typeof fetch>(async () => {
      reads += 1;
      if (reads === 1) return new Response(null, { status: 404 });
      if (reads === 2) {
        return Response.json(
          identity({ projectId: 'prj_other', deploymentId: 'dpl_live' })
        );
      }
      return Response.json(identity({ deploymentId: 'dpl_promoted' }));
    });
    await expect(
      resolveSummerEveCallerOrigin({ fetchImpl: failing })
    ).rejects.toBeInstanceOf(SummerPinInvalidError);
    await expect(
      resolveSummerEveCallerOrigin({ fetchImpl: failing })
    ).rejects.toBeInstanceOf(SummerPinInvalidError);
    let now = 1_000;
    const input = {
      pinnedOrigin: ORIGIN,
      pinnedDeploymentId: ID,
      fetchImpl: failing,
      now: () => now,
    };
    await expect(resolveSummerEveCallerOrigin(input)).resolves.toEqual({
      origin: alias,
      deploymentId: 'dpl_promoted',
    });
    now += 10 * 60 * 1000 - 1;
    await resolveSummerEveCallerOrigin(input);
    expect(failing).toHaveBeenCalledTimes(3);
    expect(errorSpy).toHaveBeenCalledTimes(3);
    now += 1;
    await resolveSummerEveCallerOrigin(input);
    expect(failing).toHaveBeenCalledTimes(4);
  });
});
