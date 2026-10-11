import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSessionFromCtxMock } = vi.hoisted(() => ({
  getSessionFromCtxMock: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('better-auth/api', async importOriginal => ({
  ...(await importOriginal<typeof import('better-auth/api')>()),
  // Call hook bodies directly with a hand-built context.
  createAuthMiddleware: (handler: unknown) => handler,
  getSessionFromCtx: getSessionFromCtxMock,
}));

import { ADMIN_STEP_UP_TTL_MS } from '@/lib/admin/mfa';
import {
  adminPasskeyStepUp,
  devicePasskeyIdentifier,
  passkeyChangeAllowed,
} from './admin-passkey-step-up';

const MIN = 60 * 1000;

describe('passkeyChangeAllowed', () => {
  it('allows first enrollment right after sign-in', () => {
    expect(
      passkeyChangeAllowed({
        hasLiveStepUp: false,
        existingPasskeys: 0,
        sessionAgeMs: 2 * MIN,
      })
    ).toBe(true);
  });

  it('refuses first enrollment on an old (possibly stolen) session', () => {
    expect(
      passkeyChangeAllowed({
        hasLiveStepUp: false,
        existingPasskeys: 0,
        sessionAgeMs: 11 * MIN,
      })
    ).toBe(false);
  });

  it('refuses removing or renaming passkeys without a step-up once one exists', () => {
    expect(
      passkeyChangeAllowed({
        hasLiveStepUp: false,
        existingPasskeys: 1,
        sessionAgeMs: MIN,
        change: 'modify',
      })
    ).toBe(false);
    expect(
      passkeyChangeAllowed({
        hasLiveStepUp: false,
        existingPasskeys: 1,
        sessionAgeMs: MIN,
      })
    ).toBe(false);
  });

  it('lets a fresh sign-in add a device passkey when another exists', () => {
    expect(
      passkeyChangeAllowed({
        hasLiveStepUp: false,
        existingPasskeys: 2,
        sessionAgeMs: 3 * MIN,
        change: 'register',
      })
    ).toBe(true);
  });

  it('refuses adding a passkey on a stale session without a step-up', () => {
    expect(
      passkeyChangeAllowed({
        hasLiveStepUp: false,
        existingPasskeys: 2,
        sessionAgeMs: 11 * MIN,
        change: 'register',
      })
    ).toBe(false);
  });

  it('allows changes with a live step-up', () => {
    expect(
      passkeyChangeAllowed({
        hasLiveStepUp: true,
        existingPasskeys: 3,
        sessionAgeMs: 100 * MIN,
      })
    ).toBe(true);
  });

  it('refuses clock-skewed future sessions', () => {
    expect(
      passkeyChangeAllowed({
        hasLiveStepUp: false,
        existingPasskeys: 0,
        sessionAgeMs: -5 * MIN,
      })
    ).toBe(false);
  });
});

type HookHandler = (context: unknown) => Promise<unknown>;

function hooks() {
  const plugin = adminPasskeyStepUp();
  return {
    before: plugin.hooks?.before?.[0]?.handler as unknown as HookHandler,
    after: plugin.hooks?.after?.[0]?.handler as unknown as HookHandler,
    afterRegistration: plugin.hooks?.after?.[1]
      ?.handler as unknown as HookHandler,
  };
}

function authContext(overrides: {
  readonly newSession?: { session: { id: string } } | null;
  readonly receipt?: { expiresAt: Date } | null;
  readonly deviceMarker?: { value: string } | null;
  readonly passkeys?: number;
  readonly path?: string;
  readonly credentialId?: string;
  readonly returned?: unknown;
}) {
  const createVerificationValue = vi.fn().mockResolvedValue({});
  const findVerificationValue = vi.fn(async (identifier: string) =>
    identifier.startsWith('device-passkey:')
      ? (overrides.deviceMarker ?? null)
      : (overrides.receipt ?? null)
  );
  const count = vi.fn().mockResolvedValue(overrides.passkeys ?? 0);
  return {
    createVerificationValue,
    findVerificationValue,
    ctx: {
      path: overrides.path ?? '/passkey/verify-registration',
      body: overrides.credentialId
        ? { response: { id: overrides.credentialId } }
        : {},
      context: {
        newSession: overrides.newSession ?? null,
        returned: overrides.returned ?? { id: 'pk_1' },
        internalAdapter: { createVerificationValue, findVerificationValue },
        adapter: { count },
      },
    },
  };
}

describe('adminPasskeyStepUp after-hook', () => {
  it('writes a 12h receipt bound to the session the passkey sign-in minted', async () => {
    const { ctx, createVerificationValue } = authContext({
      newSession: { session: { id: 'sess_new' } },
    });
    const before = Date.now();

    await hooks().after(ctx);

    expect(createVerificationValue).toHaveBeenCalledTimes(1);
    const [receipt] = createVerificationValue.mock.calls[0];
    expect(receipt.identifier).toBe('admin-step-up:sess_new');
    expect(receipt.expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + ADMIN_STEP_UP_TTL_MS
    );
    expect(receipt.expiresAt.getTime()).toBeLessThanOrEqual(
      Date.now() + ADMIN_STEP_UP_TTL_MS
    );
  });

  it('writes no receipt when verification failed and minted no session', async () => {
    // verify-authentication throws on every failure path before
    // setSessionCookie, so a missing newSession means no step-up happened.
    const { ctx, createVerificationValue } = authContext({ newSession: null });

    await hooks().after(ctx);

    expect(createVerificationValue).not.toHaveBeenCalled();
  });

  it('propagates a receipt write failure instead of reporting success', async () => {
    const { ctx, createVerificationValue } = authContext({
      newSession: { session: { id: 'sess_new' } },
    });
    createVerificationValue.mockRejectedValue(new Error('db down'));

    await expect(hooks().after(ctx)).rejects.toThrow('db down');
  });

  it('only runs on passkey verify-authentication', () => {
    const matcher = adminPasskeyStepUp().hooks?.after?.[0]?.matcher;
    expect(matcher?.({ path: '/passkey/verify-authentication' } as never)).toBe(
      true
    );
    expect(matcher?.({ path: '/passkey/verify-registration' } as never)).toBe(
      false
    );
  });
});

describe('device passkeys', () => {
  beforeEach(() => {
    getSessionFromCtxMock.mockReset();
    getSessionFromCtxMock.mockResolvedValue({
      session: { id: 'sess_1', createdAt: new Date(Date.now() - MIN) },
      user: { id: 'user_1' },
    });
  });

  it('marks a passkey added on a fresh sign-in next to existing ones as device-only', async () => {
    const { ctx, createVerificationValue } = authContext({
      passkeys: 2,
      credentialId: 'cred_mac',
    });
    await hooks().afterRegistration(ctx);
    expect(createVerificationValue).toHaveBeenCalledWith({
      identifier: 'device-passkey:cred_mac',
      value: 'user_1',
      expiresAt: expect.any(Date),
    });
  });

  it('keeps the first passkey and step-up enrollments as admin factors', async () => {
    const first = authContext({ passkeys: 1, credentialId: 'cred_first' });
    await hooks().afterRegistration(first.ctx);
    expect(first.createVerificationValue).not.toHaveBeenCalled();

    const stepped = authContext({
      passkeys: 3,
      credentialId: 'cred_stepped',
      receipt: { expiresAt: new Date(Date.now() + MIN) },
    });
    await hooks().afterRegistration(stepped.ctx);
    expect(stepped.createVerificationValue).not.toHaveBeenCalled();
  });

  it('marks nothing when registration failed', async () => {
    const { ctx, createVerificationValue } = authContext({
      passkeys: 2,
      credentialId: 'cred_mac',
      returned: new Error('verification failed'),
    });
    await hooks().afterRegistration(ctx);
    expect(createVerificationValue).not.toHaveBeenCalled();
  });

  it('signs in with a device passkey but writes no admin step-up receipt', async () => {
    const { ctx, createVerificationValue, findVerificationValue } = authContext(
      {
        path: '/passkey/verify-authentication',
        newSession: { session: { id: 'sess_mac' } },
        credentialId: 'cred_mac',
        deviceMarker: { value: 'user_1' },
      }
    );
    await hooks().after(ctx);
    expect(findVerificationValue).toHaveBeenCalledWith(
      devicePasskeyIdentifier('cred_mac')
    );
    expect(createVerificationValue).not.toHaveBeenCalled();
  });

  it('still writes the receipt for an admin-factor passkey', async () => {
    const { ctx, createVerificationValue } = authContext({
      path: '/passkey/verify-authentication',
      newSession: { session: { id: 'sess_admin' } },
      credentialId: 'cred_admin',
    });
    await hooks().after(ctx);
    expect(createVerificationValue).toHaveBeenCalledTimes(1);
  });

  it('allows a fresh sign-in to request registration options with passkeys present', async () => {
    const { ctx } = authContext({
      path: '/passkey/generate-register-options',
      passkeys: 2,
    });
    await expect(hooks().before(ctx)).resolves.toBeUndefined();
  });

  it('still requires a step-up to delete a passkey on a fresh sign-in', async () => {
    const { ctx } = authContext({
      path: '/passkey/delete-passkey',
      passkeys: 2,
    });
    await expect(hooks().before(ctx)).rejects.toMatchObject({
      status: 'FORBIDDEN',
    });
  });
});

describe('adminPasskeyStepUp before-hook', () => {
  beforeEach(() => {
    getSessionFromCtxMock.mockReset();
  });

  function signedIn(ageMs: number) {
    getSessionFromCtxMock.mockResolvedValue({
      session: { id: 'sess_1', createdAt: new Date(Date.now() - ageMs) },
      user: { id: 'user_1' },
    });
  }

  it('rejects passkey changes without a session', async () => {
    getSessionFromCtxMock.mockResolvedValue(null);
    await expect(hooks().before(authContext({}).ctx)).rejects.toMatchObject({
      status: 'UNAUTHORIZED',
    });
  });

  it('allows first enrollment on a fresh sign-in', async () => {
    signedIn(2 * MIN);
    await expect(
      hooks().before(authContext({ passkeys: 0 }).ctx)
    ).resolves.toBeUndefined();
  });

  it('refuses first enrollment on a stale session', async () => {
    signedIn(11 * MIN);
    await expect(
      hooks().before(authContext({ passkeys: 0 }).ctx)
    ).rejects.toMatchObject({ status: 'FORBIDDEN' });
  });

  it('refuses changes with an expired receipt once a passkey exists', async () => {
    signedIn(MIN);
    const { ctx, findVerificationValue } = authContext({
      path: '/passkey/delete-passkey',
      passkeys: 1,
      receipt: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(hooks().before(ctx)).rejects.toMatchObject({
      status: 'FORBIDDEN',
    });
    expect(findVerificationValue).toHaveBeenCalledWith('admin-step-up:sess_1');
  });

  it('allows changes with a live receipt for this session', async () => {
    signedIn(100 * MIN);
    await expect(
      hooks().before(
        authContext({
          passkeys: 2,
          receipt: { expiresAt: new Date(Date.now() + MIN) },
        }).ctx
      )
    ).resolves.toBeUndefined();
  });
});
