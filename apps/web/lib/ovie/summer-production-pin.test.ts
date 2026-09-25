import { afterEach, describe, expect, it, vi } from 'vitest';
import { SUMMER_PRODUCTION } from './summer-production-identity';
import {
  assertSummerProductionPin,
  resetSummerProductionPinCache,
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
  const fetchImpl = vi.fn(async () => body());
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
