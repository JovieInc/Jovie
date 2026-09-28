import { afterEach, describe, expect, it, vi } from 'vitest';
import { SUMMER_PRODUCTION } from './summer-production-identity';
import {
  resetSummerProductionPinCache,
  resolveSummerEveCallerOrigin,
  SummerPinInvalidError,
} from './summer-production-pin';

const alias = SUMMER_PRODUCTION.productionOrigin;
const SOURCE_REVISION = 'a'.repeat(40);

function identity(overrides: Record<string, unknown> = {}) {
  return {
    schema: SUMMER_PRODUCTION.identitySchema,
    id: SUMMER_PRODUCTION.serviceId,
    projectId: SUMMER_PRODUCTION.projectId,
    teamId: SUMMER_PRODUCTION.teamId,
    environment: 'production',
    deploymentId: 'dpl_live',
    blobAuth: 'oidc',
    status: SUMMER_PRODUCTION.sourceBoundStatus,
    sourceRevision: SOURCE_REVISION,
    productionOrigin: alias,
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
    vi.unstubAllEnvs();
  });

  it('uses the production domain after a source-bound identity check', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchImpl = installFetch(() =>
      Response.json(identity({ deploymentId: 'dpl_promoted' }))
    );
    vi.stubEnv('OVIE_SUMMER_EVE_DEPLOYMENT_ORIGIN', 'legacy-ignored');
    vi.stubEnv('OVIE_SUMMER_EVE_EXPECTED_DEPLOYMENT_ID', 'legacy-ignored');
    await expect(resolveSummerEveCallerOrigin({ fetchImpl })).resolves.toEqual({
      origin: alias,
      deploymentId: 'dpl_promoted',
    });
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
      `${alias}/runtime/v1/identity`
    );
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('fails closed on a mismatch and does not accept another responder', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const cases = [
      identity({ status: 'configured-unverified' }),
      identity({ projectId: 'prj_other' }),
      identity({ environment: 'preview' }),
      identity({ target: 'preview' }),
      identity({ blobAuth: 'static' }),
      identity({ sourceRevision: 'main' }),
      identity({ productionOrigin: 'https://evil.test' }),
      identity({ schema: 'other' }),
      identity({ teamId: 'team_other' }),
    ];
    for (const body of cases) {
      const fetchImpl = installFetch(() => Response.json(body));
      await expect(
        resolveSummerEveCallerOrigin({ fetchImpl })
      ).rejects.toBeInstanceOf(SummerPinInvalidError);
      expect(fetchImpl).toHaveBeenCalledOnce();
      expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
        `${alias}/runtime/v1/identity`
      );
      resetSummerProductionPinCache();
    }
    expect(errorSpy).toHaveBeenCalledTimes(cases.length);
    const logged = errorSpy.mock.calls[0]?.[0] as {
      event?: string;
      observed?: { fallback?: string };
    };
    expect(logged.event).toBe('summer_pin_invalid');
    expect(logged.observed).not.toHaveProperty('fallback');
  });

  it('fails closed without caching a bad alias, and memoizes a good one', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let reads = 0;
    const failing = vi.fn<typeof fetch>(async () => {
      reads += 1;
      if (reads === 1) return new Response(null, { status: 404 });
      if (reads === 2) {
        return Response.json(identity({ projectId: 'prj_other' }));
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
    const input = { fetchImpl: failing, now: () => now };
    await expect(resolveSummerEveCallerOrigin(input)).resolves.toEqual({
      origin: alias,
      deploymentId: 'dpl_promoted',
    });
    now += 10 * 60 * 1000 - 1;
    await resolveSummerEveCallerOrigin(input);
    expect(failing).toHaveBeenCalledTimes(3);
    expect(errorSpy).toHaveBeenCalledTimes(2);
    now += 1;
    await resolveSummerEveCallerOrigin(input);
    expect(failing).toHaveBeenCalledTimes(4);
  });

  it('re-reads a promoted alias once inside the TTL when refresh is set', async () => {
    let deploymentId = 'dpl_cachedA';
    let now = 1_000;
    const fetchImpl = installFetch(() =>
      Response.json(identity({ deploymentId }))
    );
    const input = { fetchImpl, now: () => now };
    await expect(resolveSummerEveCallerOrigin(input)).resolves.toEqual({
      origin: alias,
      deploymentId: 'dpl_cachedA',
    });
    deploymentId = 'dpl_promotedB';
    now += 1_000;
    await expect(resolveSummerEveCallerOrigin(input)).resolves.toEqual({
      origin: alias,
      deploymentId: 'dpl_cachedA',
    });
    await expect(
      resolveSummerEveCallerOrigin({ ...input, refresh: true })
    ).resolves.toEqual({
      origin: alias,
      deploymentId: 'dpl_promotedB',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const init = fetchImpl.mock.calls[0]?.[1];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('bounds the identity GET with a five second abort', async () => {
    const timeout = vi
      .spyOn(AbortSignal, 'timeout')
      .mockReturnValue(new AbortController().signal);
    const fetchImpl = installFetch(() => Response.json(identity()));
    await resolveSummerEveCallerOrigin({ fetchImpl });
    expect(timeout).toHaveBeenCalledWith(5_000);
    timeout.mockRestore();
  });

  it('fails closed when the identity endpoint is unreachable', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new Error('offline');
    });
    await expect(
      resolveSummerEveCallerOrigin({ fetchImpl })
    ).rejects.toBeInstanceOf(SummerPinInvalidError);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
