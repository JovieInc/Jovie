import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ensurePrivacyLockCanBeEnabled,
  PasskeyStepUpError,
  unlockWithPasskey,
} from './unlock-with-passkey';

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
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  delete (globalThis as Record<string, unknown>)[
    '__JOVIE_PASSKEY_STEP_UP_TIMEOUT_MS__'
  ];
});

describe('unlockWithPasskey', () => {
  it('requires an existing credential for OAuth recovery without enrolling one', async () => {
    client.listUserPasskeys.mockResolvedValue({ data: [], error: null });
    await expect(
      unlockWithPasskey({ allowEnrollment: false })
    ).rejects.toMatchObject({ code: 'setup-required' });
    expect(client.addPasskey).not.toHaveBeenCalled();
    expect(client.signInPasskey).not.toHaveBeenCalled();
  });

  it('signs in with the passkey and confirms the step-up receipt', async () => {
    await unlockWithPasskey();

    expect(client.signInPasskey).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/step-up-status',
      expect.objectContaining({ credentials: 'same-origin' })
    );
  });

  it('verifies passkey before accepting a confirmed server privacy receipt', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-29T20:00:00.000Z'));
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        enabled: true,
        locked: false,
        unlockedUntil: '2026-09-30T20:00:00.000Z',
      }),
    });

    await unlockWithPasskey({ purpose: 'privacy' });

    expect(client.signInPasskey).toHaveBeenCalledOnce();
    expect(client.signInPasskey.mock.invocationCallOrder[0]).toBeLessThan(
      fetchMock.mock.invocationCallOrder[0]
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ovie/privacy-lock',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'unlock' }),
      })
    );
  });

  it('allows privacy opt-in only when a supported, registered passkey exists', async () => {
    await expect(ensurePrivacyLockCanBeEnabled()).resolves.toBeUndefined();
    expect(client.listUserPasskeys).toHaveBeenCalledOnce();
    expect(client.signInPasskey).not.toHaveBeenCalled();
    expect(client.addPasskey).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects privacy opt-in when no passkey is registered without enrolling one', async () => {
    client.listUserPasskeys.mockResolvedValue({ data: [], error: null });

    await expect(ensurePrivacyLockCanBeEnabled()).rejects.toMatchObject({
      code: 'setup-required',
      message: expect.stringContaining('No passkey is registered'),
    });
    expect(client.addPasskey).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not post an unlock after a cancelled privacy passkey ceremony', async () => {
    client.signInPasskey.mockResolvedValue({
      data: null,
      error: { code: 'AUTH_CANCELLED', message: 'Auth cancelled' },
    });

    await expect(
      unlockWithPasskey({ purpose: 'privacy' })
    ).rejects.toMatchObject({ code: 'cancelled' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not enroll a passkey during privacy unlock', async () => {
    client.listUserPasskeys.mockResolvedValue({ data: [], error: null });

    await expect(
      unlockWithPasskey({ purpose: 'privacy' })
    ).rejects.toMatchObject({
      code: 'setup-required',
      message: expect.stringContaining('No passkey is registered'),
    });
    expect(client.addPasskey).not.toHaveBeenCalled();
    expect(client.signInPasskey).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    { enabled: true, locked: true, unlockedUntil: null },
    {
      enabled: false,
      locked: false,
      unlockedUntil: '2026-09-30T20:00:00.000Z',
    },
    { enabled: true, locked: false, unlockedUntil: 'not-a-date' },
    { enabled: true, locked: false, unlockedUntil: '2026-09-29T19:59:59.000Z' },
  ])(
    'fails closed unless the server returns a valid active privacy receipt: %o',
    async state => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-29T20:00:00.000Z'));
      fetchMock.mockResolvedValue({ ok: true, json: async () => state });

      await expect(
        unlockWithPasskey({ purpose: 'privacy' })
      ).rejects.toMatchObject({ code: 'unconfirmed' });
      expect(fetchMock).toHaveBeenCalledOnce();
    }
  );

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

    expect(client.addPasskey).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Ovie' })
    );
    expect(client.signInPasskey).toHaveBeenCalledOnce();
  });

  it('reports cancellation when enrollment aborts before the authenticator saves', async () => {
    client.listUserPasskeys.mockResolvedValue({ data: [], error: null });
    client.addPasskey.mockResolvedValue({
      data: null,
      error: {
        code: 'ERROR_CEREMONY_ABORTED',
        message: 'Registration cancelled',
      },
    });

    await expect(unlockWithPasskey()).rejects.toMatchObject({
      name: 'PasskeyStepUpError',
      code: 'cancelled',
      message: expect.stringContaining('no passkey was saved'),
    });
    expect(client.signInPasskey).not.toHaveBeenCalled();
  });

  it('does not treat a data-less enrollment result as a saved passkey', async () => {
    client.listUserPasskeys.mockResolvedValue({ data: [], error: null });
    client.addPasskey.mockResolvedValue({ data: null, error: null });

    await expect(unlockWithPasskey()).rejects.toMatchObject({
      name: 'PasskeyStepUpError',
      code: 'cancelled',
    });
    expect(client.signInPasskey).not.toHaveBeenCalled();
  });

  it('recovers when a retry after cancellation enrolls successfully', async () => {
    client.listUserPasskeys.mockResolvedValue({ data: [], error: null });
    client.addPasskey
      .mockResolvedValueOnce({
        data: null,
        error: { code: 'AUTH_CANCELLED', message: 'Auth cancelled' },
      })
      .mockResolvedValueOnce({ data: {}, error: null });

    await expect(unlockWithPasskey()).rejects.toMatchObject({
      code: 'cancelled',
    });
    await unlockWithPasskey();

    expect(client.addPasskey).toHaveBeenCalledTimes(2);
    expect(client.signInPasskey).toHaveBeenCalledOnce();
  });

  it('fails closed as setup-required when sign-in offers an unregistered credential', async () => {
    client.listUserPasskeys
      .mockResolvedValueOnce({ data: [{ id: 'pk1' }], error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    client.signInPasskey.mockResolvedValue({
      data: null,
      error: { code: 'PASSKEY_NOT_FOUND', message: 'Passkey not found' },
    });

    await expect(unlockWithPasskey()).rejects.toMatchObject({
      name: 'PasskeyStepUpError',
      code: 'setup-required',
      message: expect.stringContaining('not registered'),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces the server error when an unregistered credential is actually listed', async () => {
    client.signInPasskey.mockResolvedValue({
      data: null,
      error: { code: 'PASSKEY_NOT_FOUND', message: 'Passkey not found' },
    });

    await expect(unlockWithPasskey()).rejects.toThrow('Passkey not found');
  });

  it('reports sign-in prompt cancellation as retryable', async () => {
    client.signInPasskey.mockResolvedValue({
      data: null,
      error: { code: 'AUTH_CANCELLED', message: 'Auth cancelled' },
    });

    await expect(unlockWithPasskey()).rejects.toMatchObject({
      name: 'PasskeyStepUpError',
      code: 'cancelled',
      message: expect.stringContaining('Try again'),
    });
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
