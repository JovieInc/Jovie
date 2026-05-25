import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  captureErrorMock: vi.fn(),
  generatePassBufferMock: vi.fn(),
  getChangedSerialsMock: vi.fn(),
  getPassBySerialMock: vi.fn(),
  registerDeviceMock: vi.fn(),
  unregisterDeviceMock: vi.fn(),
  verifyTokenMock: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {},
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureErrorMock,
}));

vi.mock('@/lib/wallet/apple/profile-pass', () => ({
  buildAppleWalletPassFileName: (handle: string) => `jovie-${handle}.pkpass`,
  buildAppleWalletPassResponseHeaders: (fileName: string) => ({
    'Cache-Control': 'no-store',
    'Content-Disposition': `attachment; filename="${fileName}"`,
    'Content-Type': 'application/vnd.apple.pkpass',
  }),
  generateAppleWalletProfilePassBuffer: hoisted.generatePassBufferMock,
  getAppleWalletPassBySerial: hoisted.getPassBySerialMock,
  getChangedAppleWalletSerialNumbers: hoisted.getChangedSerialsMock,
  registerAppleWalletDevice: hoisted.registerDeviceMock,
  toAppleWalletPassResponseBody: (buffer: Buffer) => {
    const body = new ArrayBuffer(buffer.byteLength);
    new Uint8Array(body).set(buffer);
    return body;
  },
  unregisterAppleWalletDevice: hoisted.unregisterDeviceMock,
  verifyAppleWalletAuthenticationToken: hoisted.verifyTokenMock,
}));

const registrationRoutePromise = import(
  '@/app/api/wallet/apple/v1/devices/[deviceLibraryIdentifier]/registrations/[passTypeIdentifier]/[serialNumber]/route'
);
const changedSerialsRoutePromise = import(
  '@/app/api/wallet/apple/v1/devices/[deviceLibraryIdentifier]/registrations/[passTypeIdentifier]/route'
);
const latestPassRoutePromise = import(
  '@/app/api/wallet/apple/v1/passes/[passTypeIdentifier]/[serialNumber]/route'
);

const pass = {
  id: 'pass_123',
  authenticationTokenHash: 'hash',
  handle: 'tim',
  passTypeIdentifier: 'pass.ie.jov.profile',
  serialNumber: 'serial_123',
};

const registrationParams = Promise.resolve({
  deviceLibraryIdentifier: 'device_123',
  passTypeIdentifier: 'pass.ie.jov.profile',
  serialNumber: 'serial_123',
});

const changedSerialsParams = Promise.resolve({
  deviceLibraryIdentifier: 'device_123',
  passTypeIdentifier: 'pass.ie.jov.profile',
});

const latestPassParams = Promise.resolve({
  passTypeIdentifier: 'pass.ie.jov.profile',
  serialNumber: 'serial_123',
});

function request(
  url: string,
  init: ConstructorParameters<typeof NextRequest>[1] = {}
) {
  return new NextRequest(url, init);
}

describe('Apple Wallet update service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getPassBySerialMock.mockResolvedValue(pass);
    hoisted.verifyTokenMock.mockReturnValue(true);
    hoisted.registerDeviceMock.mockResolvedValue('created');
    hoisted.unregisterDeviceMock.mockResolvedValue(undefined);
    hoisted.getChangedSerialsMock.mockResolvedValue(null);
    hoisted.generatePassBufferMock.mockResolvedValue(Buffer.from([1, 2, 3]));
  });

  it('registers a Wallet device with pass auth', async () => {
    const { POST } = await registrationRoutePromise;
    const response = await POST(
      request('http://localhost/api/wallet/apple/v1/register', {
        method: 'POST',
        headers: {
          authorization: 'ApplePass token_123',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ pushToken: 'push_123' }),
      }),
      { params: registrationParams }
    );

    expect(response.status).toBe(201);
    expect(hoisted.registerDeviceMock).toHaveBeenCalledWith(expect.anything(), {
      deviceLibraryIdentifier: 'device_123',
      passId: 'pass_123',
      pushToken: 'push_123',
    });
  });

  it('rejects registration when the pass token is invalid', async () => {
    hoisted.verifyTokenMock.mockReturnValue(false);

    const { POST } = await registrationRoutePromise;
    const response = await POST(
      request('http://localhost/api/wallet/apple/v1/register', {
        method: 'POST',
        headers: { authorization: 'ApplePass bad_token' },
        body: JSON.stringify({ pushToken: 'push_123' }),
      }),
      { params: registrationParams }
    );

    expect(response.status).toBe(401);
    expect(hoisted.registerDeviceMock).not.toHaveBeenCalled();
  });

  it('unregisters a Wallet device idempotently', async () => {
    const { DELETE } = await registrationRoutePromise;
    const response = await DELETE(
      request('http://localhost/api/wallet/apple/v1/register', {
        method: 'DELETE',
        headers: { authorization: 'ApplePass token_123' },
      }),
      { params: registrationParams }
    );

    expect(response.status).toBe(200);
    expect(hoisted.unregisterDeviceMock).toHaveBeenCalledWith(
      expect.anything(),
      {
        deviceLibraryIdentifier: 'device_123',
        passId: 'pass_123',
      }
    );
  });

  it('returns changed serial numbers and 204 when nothing changed', async () => {
    const { GET } = await changedSerialsRoutePromise;
    hoisted.getChangedSerialsMock.mockResolvedValueOnce({
      serialNumbers: ['serial_123'],
      lastUpdated: '2026-05-24T00:00:00.000Z',
    });

    const changedResponse = await GET(
      request(
        'http://localhost/api/wallet/apple/v1/changes?passesUpdatedSince=tag_1'
      ),
      { params: changedSerialsParams }
    );

    expect(changedResponse.status).toBe(200);
    await expect(changedResponse.json()).resolves.toEqual({
      serialNumbers: ['serial_123'],
      lastUpdated: '2026-05-24T00:00:00.000Z',
    });

    const unchangedResponse = await GET(
      request('http://localhost/api/wallet/apple/v1/changes'),
      { params: changedSerialsParams }
    );

    expect(unchangedResponse.status).toBe(204);
  });

  it('returns the latest signed pass with Wallet MIME headers', async () => {
    const { GET } = await latestPassRoutePromise;
    const response = await GET(
      request('http://localhost/api/wallet/apple/v1/pass', {
        headers: { authorization: 'ApplePass token_123' },
      }),
      { params: latestPassParams }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(
      'application/vnd.apple.pkpass'
    );
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="jovie-tim.pkpass"'
    );
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3])
    );
  });
});
