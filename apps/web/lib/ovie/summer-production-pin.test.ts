import { afterEach, describe, expect, it, vi } from 'vitest';
import { SUMMER_PRODUCTION } from './summer-production-identity';
import {
  assertSummerProductionPin,
  resetSummerProductionPinCache,
  resolveSummerEveCallerOrigin,
  SummerPinInvalidError,
} from './summer-production-pin';

const ORIGIN = 'https://jovie-eve-shadow-abc123-jovie.vercel.app';
const ID = 'dpl_pinned123';

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
  const fetchImpl = vi.fn<typeof fetch>(async () => body());
  return fetchImpl;
}

describe('assertSummerProductionPin', () => {
  afterEach(() => {
    resetSummerProductionPinCache();
    vi.restoreAllMocks();
  });

  it('memoizes a matching identity for 10 minutes', async () => {
    const fetchImpl = installFetch(() => Response.json(identity()));
    let now = 1_000;
    await assertSummerProductionPin({
      origin: ORIGIN,
      deploymentId: ID,
      fetchImpl,
      now: () => now,
    });
    now += 10 * 60 * 1000 - 1;
    await assertSummerProductionPin({
      origin: ORIGIN,
      deploymentId: ID,
      fetchImpl,
      now: () => now,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    now += 1;
    await assertSummerProductionPin({
      origin: ORIGIN,
      deploymentId: ID,
      fetchImpl,
      now: () => now,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('fails closed on a project, environment, or deployment mismatch', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchImpl = installFetch(() =>
      Response.json(
        identity({ projectId: 'prj_other', environment: 'preview' })
      )
    );
    await expect(
      assertSummerProductionPin({ origin: ORIGIN, deploymentId: ID, fetchImpl })
    ).rejects.toBeInstanceOf(SummerPinInvalidError);
    expect(JSON.stringify(errorSpy.mock.calls)).toContain('summer_pin_invalid');
    expect(JSON.stringify(errorSpy.mock.calls)).toContain('prj_other');
  });

  it('fails closed when identity returns 404', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchImpl = installFetch(() => new Response(null, { status: 404 }));
    await expect(
      assertSummerProductionPin({ origin: ORIGIN, deploymentId: ID, fetchImpl })
    ).rejects.toMatchObject({ code: 'summer_pin_invalid' });
    const logged = errorSpy.mock.calls[0]?.[0] as {
      event?: string;
      observed?: { status?: number };
    };
    expect(logged.event).toBe('summer_pin_invalid');
    expect(logged.observed?.status).toBe(404);
  });

  it('does not cache a failed identity read', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce(Response.json(identity()));
    await expect(
      assertSummerProductionPin({ origin: ORIGIN, deploymentId: ID, fetchImpl })
    ).rejects.toMatchObject({ code: 'summer_pin_invalid' });
    await expect(
      assertSummerProductionPin({ origin: ORIGIN, deploymentId: ID, fetchImpl })
    ).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe('resolveSummerEveCallerOrigin', () => {
  const alias = SUMMER_PRODUCTION.productionOrigin;

  afterEach(() => {
    resetSummerProductionPinCache();
    vi.restoreAllMocks();
  });

  it('returns the alias and live deployment when no pin is configured', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchImpl = installFetch(() =>
      Response.json(identity({ deploymentId: 'dpl_live' }))
    );
    await expect(resolveSummerEveCallerOrigin({ fetchImpl })).resolves.toEqual({
      origin: alias,
      deploymentId: 'dpl_live',
    });
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
      `${alias}/runtime/v1/identity`
    );
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('stays silent when the pinned id matches the alias deployment', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchImpl = installFetch(() => Response.json(identity()));
    await expect(
      resolveSummerEveCallerOrigin({
        pinnedOrigin: ORIGIN,
        pinnedDeploymentId: ID,
        fetchImpl,
      })
    ).resolves.toEqual({ origin: alias, deploymentId: ID });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
      `${alias}/runtime/v1/identity`
    );
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('logs a stale pin and still returns the production alias', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const stderr = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    const fetchImpl = installFetch(() =>
      Response.json(identity({ deploymentId: 'dpl_promoted' }))
    );
    await expect(
      resolveSummerEveCallerOrigin({
        pinnedOrigin: ORIGIN,
        pinnedDeploymentId: ID,
        fetchImpl,
      })
    ).resolves.toEqual({ origin: alias, deploymentId: 'dpl_promoted' });
    const logged = errorSpy.mock.calls[0]?.[0] as {
      event?: string;
      observed?: { fallback?: string; deploymentId?: string };
    };
    expect(logged.event).toBe('summer_pin_invalid');
    expect(logged.observed?.fallback).toBe('production_alias');
    expect(logged.observed?.deploymentId).toBe('dpl_promoted');
    expect(String(stderr.mock.calls[0]?.[0])).toContain('production_alias');
    expect(String(fetchImpl.mock.calls[0]?.[0])).not.toContain(
      'jovie-eve-shadow'
    );
  });

  it('never requests a malicious pinned origin', async () => {
    const fetchImpl = installFetch(() =>
      Response.json(identity({ deploymentId: 'dpl_live' }))
    );
    await resolveSummerEveCallerOrigin({
      pinnedOrigin: 'https://evil.example.com',
      pinnedDeploymentId: 'dpl_evil',
      fetchImpl,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
      `${alias}/runtime/v1/identity`
    );
  });

  it('fails closed and does not cache a 404 from the alias', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(
        Response.json(identity({ deploymentId: 'dpl_live' }))
      );
    await expect(
      resolveSummerEveCallerOrigin({ fetchImpl })
    ).rejects.toBeInstanceOf(SummerPinInvalidError);
    await expect(resolveSummerEveCallerOrigin({ fetchImpl })).resolves.toEqual({
      origin: alias,
      deploymentId: 'dpl_live',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('fails closed when the alias is not production Summer', async () => {
    const fetchImpl = installFetch(() =>
      Response.json(
        identity({ projectId: 'prj_other', deploymentId: 'dpl_live' })
      )
    );
    await expect(
      resolveSummerEveCallerOrigin({ fetchImpl })
    ).rejects.toBeInstanceOf(SummerPinInvalidError);
  });

  it('memoizes a successful alias resolution for 10 minutes', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchImpl = installFetch(() =>
      Response.json(identity({ deploymentId: 'dpl_promoted' }))
    );
    let now = 1_000;
    const input = {
      pinnedOrigin: ORIGIN,
      pinnedDeploymentId: ID,
      fetchImpl,
      now: () => now,
    };
    await resolveSummerEveCallerOrigin(input);
    now += 10 * 60 * 1000 - 1;
    await resolveSummerEveCallerOrigin(input);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    now += 1;
    await resolveSummerEveCallerOrigin(input);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
