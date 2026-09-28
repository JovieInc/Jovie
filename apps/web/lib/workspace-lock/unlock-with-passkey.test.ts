import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PasskeyStepUpError, unlockWithPasskey } from './unlock-with-passkey';

const client = vi.hoisted(() => ({
  listUserPasskeys: vi.fn(),
  addPasskey: vi.fn(),
  signInPasskey: vi.fn(),
  isDesktopEnvironment: vi.fn(() => false),
  platformAuthenticatorAvailable: vi.fn(async () => true),
}));

vi.mock('@/lib/auth/client', () => ({
  authClient: {
    passkey: {
      listUserPasskeys: client.listUserPasskeys,
      addPasskey: client.addPasskey,
    },
    signIn: { passkey: client.signInPasskey },
  },
}));

vi.mock('@/lib/desktop/electron-bridge', () => ({
  isDesktopEnvironment: client.isDesktopEnvironment,
}));

const fetchMock = vi.fn();

function stubWebAuthn(present: boolean) {
  if (present) {
    Object.defineProperty(window, 'PublicKeyCredential', {
      configurable: true,
      value: Object.assign(function PublicKeyCredential() {}, {
        isUserVerifyingPlatformAuthenticatorAvailable:
          client.platformAuthenticatorAvailable,
      }),
    });
    Object.defineProperty(navigator, 'credentials', {
      configurable: true,
      value: { get: vi.fn(), create: vi.fn() },
    });
  } else {
    Object.defineProperty(window, 'PublicKeyCredential', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(navigator, 'credentials', {
      configurable: true,
      value: undefined,
    });
  }
}

function stepUpStatus(unlocked: boolean) {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ unlocked }),
  });
}

beforeEach(() => {
  stubWebAuthn(true);
  client.isDesktopEnvironment.mockReturnValue(false);
  client.platformAuthenticatorAvailable.mockResolvedValue(true);
  client.listUserPasskeys.mockResolvedValue({
    data: [{ id: 'pk1' }],
    error: null,
  });
  client.signInPasskey.mockResolvedValue({ data: {}, error: null });
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  stepUpStatus(true);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  delete (globalThis as Record<string, unknown>)[
    '__JOVIE_PASSKEY_STEP_UP_TIMEOUT_MS__'
  ];
});

describe('unlockWithPasskey', () => {
  it('signs in with the passkey and confirms the step-up receipt', async () => {
    await unlockWithPasskey();

    expect(client.signInPasskey).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/step-up-status',
      expect.objectContaining({ credentials: 'same-origin' })
    );
  });

  it('fails fast with an actionable error when WebAuthn is unavailable', async () => {
    stubWebAuthn(false);

    await expect(unlockWithPasskey()).rejects.toMatchObject({
      name: 'PasskeyStepUpError',
      code: 'unsupported',
      message: expect.stringContaining('cannot show the passkey prompt'),
    });
    expect(client.signInPasskey).not.toHaveBeenCalled();
  });

  it('fails fast in the desktop app when no platform authenticator exists', async () => {
    client.isDesktopEnvironment.mockReturnValue(true);
    client.platformAuthenticatorAvailable.mockResolvedValue(false);

    await expect(unlockWithPasskey()).rejects.toMatchObject({
      code: 'unsupported',
      message: expect.stringContaining('in your browser'),
    });
    expect(client.listUserPasskeys).not.toHaveBeenCalled();
  });

  it('treats a hung platform-authenticator probe in the desktop app as unsupported', async () => {
    client.isDesktopEnvironment.mockReturnValue(true);
    client.platformAuthenticatorAvailable.mockReturnValue(
      new Promise(() => {})
    );
    (
      globalThis as { __JOVIE_PASSKEY_STEP_UP_TIMEOUT_MS__?: number }
    ).__JOVIE_PASSKEY_STEP_UP_TIMEOUT_MS__ = 25;

    await expect(unlockWithPasskey()).rejects.toMatchObject({
      code: 'unsupported',
    });
  });

  it('turns a hung ceremony into a timeout error instead of waiting forever', async () => {
    (
      globalThis as { __JOVIE_PASSKEY_STEP_UP_TIMEOUT_MS__?: number }
    ).__JOVIE_PASSKEY_STEP_UP_TIMEOUT_MS__ = 25;
    client.signInPasskey.mockReturnValue(new Promise(() => {}));

    await expect(unlockWithPasskey()).rejects.toMatchObject({
      name: 'PasskeyStepUpError',
      code: 'timeout',
      message: expect.stringContaining('did not appear'),
    });
  });

  it('surfaces the list error', async () => {
    client.listUserPasskeys.mockResolvedValue({
      data: null,
      error: { message: 'session expired' },
    });

    await expect(unlockWithPasskey()).rejects.toThrow('session expired');
  });

  it('enrolls a first passkey before signing in', async () => {
    client.listUserPasskeys.mockResolvedValue({ data: [], error: null });
    client.addPasskey.mockResolvedValue({ data: {}, error: null });

    await unlockWithPasskey();

    expect(client.addPasskey).toHaveBeenCalledWith({ name: 'Ovie' });
  });

  it('fails loudly when the signed-in passkey is not an admin factor', async () => {
    stepUpStatus(false);

    const error = await unlockWithPasskey().catch(e => e);
    expect(error).toBeInstanceOf(PasskeyStepUpError);
    expect(error).toMatchObject({
      code: 'admin-factor-missing',
      message: expect.stringContaining('cannot unlock admin access'),
    });
  });

  it('reports an unconfirmed unlock when the status check fails', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));

    await expect(unlockWithPasskey()).rejects.toMatchObject({
      code: 'unconfirmed',
      message: expect.stringContaining('Could not confirm the unlock'),
    });
  });
});
