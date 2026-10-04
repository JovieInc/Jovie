import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/internal/ovie/fleet/events/route';
import { summerFleetRuntime } from './summer-runtime';

const mocks = vi.hoisted(() => {
  const profiles = vi.fn(async () => [{ id: 'owned-profile' }]);
  const where = vi.fn(() => ({ limit: profiles }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  const validateMission = vi.fn(async () => true);
  return {
    env: {
      JOVIE_FLEET_ENABLED: '1',
      OVIE_SUMMER_FOUNDER_APP_USER_ID: 'founder-id' as string | undefined,
    },
    profiles,
    select,
    where,
    authenticate: vi.fn(async () => false),
    limit: vi.fn(async (): Promise<Response | null> => null),
    validateMission,
    fleet: vi.fn(() => ({
      dispatcher: {},
      validateMission: validateMission as typeof validateMission | undefined,
    })),
  };
});
vi.mock('@/lib/env-server', () => ({ env: mocks.env }));
vi.mock('@/lib/db', () => ({ db: { select: mocks.select } }));
vi.mock('@/lib/ovie/summer-oidc.server', () => ({
  verifySummerOidcRequest: mocks.authenticate,
}));
vi.mock('./runtime', () => ({ fleetRuntime: mocks.fleet }));
vi.mock('./rate-limit', () => ({ limitFleetRequest: mocks.limit }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.env.JOVIE_FLEET_ENABLED = '1';
  mocks.env.OVIE_SUMMER_FOUNDER_APP_USER_ID = 'founder-id';
  mocks.limit.mockResolvedValue(null);
  mocks.fleet.mockReturnValue({
    dispatcher: {},
    validateMission: mocks.validateMission,
  });
});
describe('Summer fleet runtime boundary', () => {
  it('applies the durable shared limiter before constructing runtime or reading the body', async () => {
    const denial = new Response(null, { status: 503 });
    mocks.limit.mockResolvedValueOnce(denial);
    const request = new Request(
      'https://jov.ie/api/internal/ovie/fleet/events',
      { method: 'POST', body: 'invalid' }
    );
    expect(await POST(request)).toBe(denial);
    expect(mocks.fleet).not.toHaveBeenCalled();
    expect(mocks.authenticate).not.toHaveBeenCalled();
    expect(request.bodyUsed).toBe(false);
  });
  it('requires existing pinned Summer OIDC before any profile lookup or body read', async () => {
    const request = new Request(
      'https://jov.ie/api/internal/ovie/fleet/events',
      { method: 'POST', body: 'invalid' }
    );
    expect((await POST(request)).status).toBe(401);
    expect(mocks.authenticate).toHaveBeenCalledWith(request);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(request.bodyUsed).toBe(false);
  });
  it('derives a bounded profile roster from the configured founder and fails closed when disabled', async () => {
    const runtime = summerFleetRuntime();
    expect(await runtime.profiles()).toEqual(['owned-profile']);
    expect(mocks.profiles).toHaveBeenCalledWith(100);
    expect(mocks.where).toHaveBeenCalledTimes(1);
    mocks.select.mockClear();
    mocks.env.OVIE_SUMMER_FOUNDER_APP_USER_ID = undefined;
    expect(await runtime.profiles()).toEqual([]);
    mocks.env.OVIE_SUMMER_FOUNDER_APP_USER_ID = 'founder-id';
    mocks.env.JOVIE_FLEET_ENABLED = '0';
    expect(await runtime.profiles()).toEqual([]);
    expect(mocks.select).not.toHaveBeenCalled();
  });
  it('uses canonical Linear admission and refuses unconfigured validation', async () => {
    const mission = { issueId: 'JOV-7393' };
    expect(await summerFleetRuntime().validateMission(mission)).toBe(true);
    expect(mocks.validateMission).toHaveBeenCalledWith(mission);
    mocks.fleet.mockReturnValueOnce({
      dispatcher: {},
      validateMission: undefined,
    });
    await expect(summerFleetRuntime().validateMission(mission)).rejects.toThrow(
      'canonical_work_unavailable'
    );
  });
});
