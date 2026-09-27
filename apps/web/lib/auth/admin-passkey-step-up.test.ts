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

  it('refuses adding or removing passkeys without a step-up once one exists', () => {
    expect(
      passkeyChangeAllowed({
        hasLiveStepUp: false,
        existingPasskeys: 1,
        sessionAgeMs: MIN,
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
  };
}

function authContext(overrides: {
  readonly newSession?: { session: { id: string } } | null;
  readonly receipt?: { expiresAt: Date } | null;
  readonly passkeys?: number;
}) {
  const createVerificationValue = vi.fn().mockResolvedValue({});
  const findVerificationValue = vi
    .fn()
    .mockResolvedValue(overrides.receipt ?? null);
  const count = vi.fn().mockResolvedValue(overrides.passkeys ?? 0);
  return {
    createVerificationValue,
    findVerificationValue,
    ctx: {
      path: '/passkey/verify-registration',
      context: {
        newSession: overrides.newSession ?? null,
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
