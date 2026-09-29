import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getMobileSessionUserIdMock: vi.fn(),
  registerIosPushDeviceMock: vi.fn(),
  unregisterIosPushDeviceMock: vi.fn(),
}));

vi.mock('@/lib/mobile/session-auth', () => ({
  getMobileSessionUserId: hoisted.getMobileSessionUserIdMock,
}));

vi.mock('@/lib/notifications/ios-push-devices', () => ({
  registerIosPushDevice: hoisted.registerIosPushDeviceMock,
  unregisterIosPushDevice: hoisted.unregisterIosPushDeviceMock,
}));

const routeModulePromise = import('@/app/api/mobile/v1/push-devices/route');
const token =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function makeRequest(method: 'PUT' | 'DELETE', body: unknown) {
  return new Request('https://jov.ie/api/mobile/v1/push-devices', {
    method,
    body: JSON.stringify(body),
    headers: {
      Authorization: 'Bearer native-session',
      'Content-Type': 'application/json',
    },
  });
}

describe('/api/mobile/v1/push-devices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getMobileSessionUserIdMock.mockResolvedValue('app-user-uuid');
    hoisted.registerIosPushDeviceMock.mockResolvedValue(undefined);
    hoisted.unregisterIosPushDeviceMock.mockResolvedValue(undefined);
  });

  it('requires a valid native bearer session', async () => {
    hoisted.getMobileSessionUserIdMock.mockResolvedValue(null);
    const { PUT } = await routeModulePromise;

    const response = await PUT(
      makeRequest('PUT', {
        token,
        environment: 'sandbox',
        timezone: 'America/Los_Angeles',
      })
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(hoisted.registerIosPushDeviceMock).not.toHaveBeenCalled();
  });

  it('registers a validated APNs token for the signed-in user', async () => {
    const { PUT } = await routeModulePromise;

    const response = await PUT(
      makeRequest('PUT', {
        token,
        environment: 'sandbox',
        timezone: 'America/Los_Angeles',
      })
    );

    expect(response.status).toBe(204);
    expect(hoisted.registerIosPushDeviceMock).toHaveBeenCalledWith({
      userId: 'app-user-uuid',
      token,
      environment: 'sandbox',
      timezone: 'America/Los_Angeles',
    });
  });

  it('rejects malformed APNs tokens', async () => {
    const { PUT } = await routeModulePromise;

    const response = await PUT(
      makeRequest('PUT', {
        token: 'not-a-token',
        environment: 'sandbox',
        timezone: 'America/Los_Angeles',
      })
    );

    expect(response.status).toBe(400);
    expect(hoisted.registerIosPushDeviceMock).not.toHaveBeenCalled();
  });

  it('unregisters the device before sign-out', async () => {
    const { DELETE } = await routeModulePromise;

    const response = await DELETE(makeRequest('DELETE', { token }));

    expect(response.status).toBe(204);
    expect(hoisted.unregisterIosPushDeviceMock).toHaveBeenCalledWith({
      userId: 'app-user-uuid',
      token,
    });
  });
});
