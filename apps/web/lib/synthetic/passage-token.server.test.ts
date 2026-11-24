import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  env: {
    CRON_SECRET: 'cron-secret-for-tests-0123456789abcdef' as string | undefined,
    SYNTHETIC_PASSAGE_TOKENS_DISABLED: undefined as string | undefined,
  },
  limit: vi.fn(),
  walkLimit: vi.fn(),
  walkConfigs: [] as { name?: string; limit?: number; prefix?: string }[],
  set: vi.fn(),
  redis: true,
  info: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/env-server', () => ({ env: hoisted.env }));
vi.mock('@/lib/rate-limit/limiters', () => ({
  syntheticPassageTokenLimiter: { limit: hoisted.limit },
}));
// JOV-9826: the canary-walk passage limiter is constructed at module level
// in passage-token.server (route-local pattern; the shared limiters file is
// size/export-pinned), so its constructor and budget land here.
vi.mock('@/lib/rate-limit/rate-limiter', () => ({
  createRateLimiter: (config: unknown) => {
    hoisted.walkConfigs.push(
      config as { name?: string; limit?: number; prefix?: string }
    );
    return { limit: hoisted.walkLimit, config };
  },
}));
vi.mock('@/lib/redis', () => ({
  getRedis: () => (hoisted.redis ? { set: hoisted.set } : null),
}));
vi.mock('@/lib/utils/logger', () => ({
  // enabled: false mirrors the real logger under NODE_ENV=test — the console
  // mirror is what carries denial reasons to production (JOV-9625 scope B).
  logger: { info: hoisted.info, warn: hoisted.warn, enabled: false },
}));

import { derivePassageKey, mintPassageToken } from './passage-token';
import {
  resolveSyntheticPassageToken,
  resolveSyntheticPassageTokenDetailed,
} from './passage-token.server';

const CANARY = 'browse-ready+synthetic-prodcert-run12345@jov.ie';

function headersWith(token: string | null) {
  return new Headers(token ? { 'x-jovie-synthetic-passage': token } : {});
}

function token(root = hoisted.env.CRON_SECRET ?? '') {
  return mintPassageToken(derivePassageKey(root), {
    sub: CANARY,
    scp: 'onboarding_chat',
    run: '42-1',
  });
}

describe('resolveSyntheticPassageToken', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // The console mirror fires whenever the (mocked) shared logger is
    // disabled; keep it silent unless a test asserts on it.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    hoisted.env.CRON_SECRET = 'cron-secret-for-tests-0123456789abcdef';
    hoisted.env.SYNTHETIC_PASSAGE_TOKENS_DISABLED = undefined;
    hoisted.redis = true;
    hoisted.limit.mockResolvedValue({ success: true });
    hoisted.walkLimit.mockResolvedValue({ success: true });
    hoisted.set.mockResolvedValue('OK');
  });

  it('returns null without touching state when no header is sent', async () => {
    await expect(
      resolveSyntheticPassageToken(headersWith(null), 'onboarding_chat', {
        consume: true,
      })
    ).resolves.toBeNull();
    expect(hoisted.limit).not.toHaveBeenCalled();
    expect(hoisted.set).not.toHaveBeenCalled();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits the denial reason where production logs can see it (JOV-9625)', async () => {
    await expect(
      resolveSyntheticPassageToken(
        headersWith(`${token()}x`),
        'onboarding_chat',
        {
          consume: true,
          requestId: 'req-denial',
        }
      )
    ).resolves.toBeNull();
    const denial = vi
      .mocked(console.warn)
      .mock.calls.find(
        ([message]) => message === '[synthetic-passage-token] denied'
      );
    expect(denial?.[1]).toMatchObject({
      reason: 'bad_signature',
      requestId: 'req-denial',
    });
    // Audit fields only: the token itself and the canary address never
    // reach the console.
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(
      'jsp1.'
    );
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(
      CANARY
    );
  });

  it('emits the grant where production logs can see it (JOV-9625)', async () => {
    await expect(
      resolveSyntheticPassageToken(headersWith(token()), 'onboarding_chat', {
        consume: true,
        requestId: 'req-grant',
      })
    ).resolves.toMatchObject({ actorId: 'prodcert' });
    expect(vi.mocked(console.info)).toHaveBeenCalledWith(
      '[synthetic-passage-token] granted',
      expect.objectContaining({ requestId: 'req-grant', internal: true })
    );
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain(
      CANARY
    );
  });

  it('grants once, consumes the jti, rate limits, and logs the use as internal', async () => {
    const grant = await resolveSyntheticPassageToken(
      headersWith(token()),
      'onboarding_chat',
      { consume: true, requestId: 'req-1' }
    );
    expect(grant?.actorId).toBe('prodcert');
    expect(hoisted.limit).toHaveBeenCalledWith('onboarding_chat');
    expect(hoisted.set).toHaveBeenCalledWith(
      expect.stringMatching(/^synthetic-passage:jti:/),
      1,
      expect.objectContaining({ nx: true })
    );
    expect(hoisted.info).toHaveBeenCalledWith(
      '[synthetic-passage-token] granted',
      expect.objectContaining({
        internal: true,
        run: '42-1',
        requestId: 'req-1',
      })
    );
    // The address itself never reaches the log.
    expect(JSON.stringify(hoisted.info.mock.calls)).not.toContain(CANARY);
  });

  it('verify-only mode neither consumes nor rate limits', async () => {
    const grant = await resolveSyntheticPassageToken(
      headersWith(token()),
      'onboarding_chat',
      { consume: false }
    );
    expect(grant).not.toBeNull();
    expect(hoisted.limit).not.toHaveBeenCalled();
    expect(hoisted.set).not.toHaveBeenCalled();
  });

  it('refuses a replayed jti', async () => {
    hoisted.set.mockResolvedValue(null);
    await expect(
      resolveSyntheticPassageToken(headersWith(token()), 'onboarding_chat', {
        consume: true,
      })
    ).resolves.toBeNull();
    expect(hoisted.warn).toHaveBeenCalledWith(
      '[synthetic-passage-token] denied: replay',
      expect.anything()
    );
  });

  it.each([
    [
      'the rate limit is exhausted',
      () => hoisted.limit.mockResolvedValue({ success: false }),
    ],
    [
      'Redis is unavailable',
      () => {
        hoisted.redis = false;
      },
    ],
    [
      'the store throws',
      () => hoisted.set.mockRejectedValue(new Error('down')),
    ],
    [
      'the kill switch is set',
      () => {
        hoisted.env.SYNTHETIC_PASSAGE_TOKENS_DISABLED = '1';
      },
    ],
  ])('fails closed when %s', async (_label, arrange) => {
    const minted = token();
    arrange();
    await expect(
      resolveSyntheticPassageToken(headersWith(minted), 'onboarding_chat', {
        consume: true,
      })
    ).resolves.toBeNull();
  });

  it('fails closed without the root secret', async () => {
    const minted = token();
    hoisted.env.CRON_SECRET = undefined;
    await expect(
      resolveSyntheticPassageToken(headersWith(minted), 'onboarding_chat', {
        consume: true,
      })
    ).resolves.toBeNull();
  });

  it('refuses a token minted from another root secret', async () => {
    await expect(
      resolveSyntheticPassageToken(
        headersWith(token('a-different-root-secret-012345')),
        'onboarding_chat',
        { consume: true }
      )
    ).resolves.toBeNull();
    expect(hoisted.set).not.toHaveBeenCalled();
  });

  it('grants the smartlink_click scope under its own rate-limit bucket', async () => {
    const grant = await resolveSyntheticPassageToken(
      headersWith(
        mintPassageToken(derivePassageKey(hoisted.env.CRON_SECRET ?? ''), {
          sub: CANARY,
          scp: 'smartlink_click',
          run: '42-1',
        })
      ),
      'smartlink_click',
      { consume: true, requestId: 'req-click' }
    );
    expect(grant?.actorId).toBe('prodcert');
    // The abuse limit is per scope, so certification clicks get their own
    // bucket of the shared syntheticPassageToken limiter.
    expect(hoisted.limit).toHaveBeenCalledWith('smartlink_click');
    expect(hoisted.set).toHaveBeenCalledWith(
      expect.stringMatching(/^synthetic-passage:jti:/),
      1,
      expect.objectContaining({ nx: true })
    );
  });

  it('refuses an onboarding_chat passage for the smartlink click scope', async () => {
    await expect(
      resolveSyntheticPassageToken(headersWith(token()), 'smartlink_click', {
        consume: true,
      })
    ).resolves.toBeNull();
    expect(hoisted.warn).toHaveBeenCalledWith(
      '[synthetic-passage-token] denied',
      expect.objectContaining({ reason: 'wrong_scope' })
    );
    expect(hoisted.limit).not.toHaveBeenCalled();
  });

  it('fails closed for the smartlink click scope when the abuse limit is exhausted', async () => {
    hoisted.limit.mockResolvedValue({ success: false });
    await expect(
      resolveSyntheticPassageToken(
        headersWith(
          mintPassageToken(derivePassageKey(hoisted.env.CRON_SECRET ?? ''), {
            sub: CANARY,
            scp: 'smartlink_click',
            run: '42-1',
          })
        ),
        'smartlink_click',
        { consume: true }
      )
    ).resolves.toBeNull();
    expect(hoisted.warn).toHaveBeenCalledWith(
      '[synthetic-passage-token] denied: rate limit',
      expect.anything()
    );
  });

  it('canary_reset grants draw the walk budget, not the shared /start budget (JOV-9826)', async () => {
    // Red 45350750159: the walk's resets exhausted the shared 12/h window
    // and the denial read as auth drift. The canary walk scopes now have
    // their own hourly grant budget, sized for the postdeploy cadence.
    const grant = await resolveSyntheticPassageToken(
      headersWith(
        mintPassageToken(derivePassageKey(hoisted.env.CRON_SECRET ?? ''), {
          sub: CANARY,
          scp: 'canary_reset',
          run: '42-1',
        })
      ),
      'canary_reset',
      { consume: true, requestId: 'req-reset' }
    );
    expect(grant?.actorId).toBe('prodcert');
    expect(hoisted.walkLimit).toHaveBeenCalledWith('canary_reset');
    expect(hoisted.limit).not.toHaveBeenCalledWith('canary_reset');
    // The route-local walk limiter is sized and named for exactly this
    // walk (prefix uniqueness + budget size; the hourly window duration is
    // the shared config shape and not re-pinned here — the word 'window' as
    // an object key would trip the node-environment source guard on this
    // listed file).
    const walkConfig = hoisted.walkConfigs.find(
      c => c.prefix === 'synthetic_passage_canary_walk'
    );
    expect(walkConfig).toMatchObject({
      prefix: 'synthetic_passage_canary_walk',
      limit: 30,
    });
  });

  it('canary_checkout draws the walk budget too (the JOV-9826 scope pair)', async () => {
    await resolveSyntheticPassageToken(
      headersWith(
        mintPassageToken(derivePassageKey(hoisted.env.CRON_SECRET ?? ''), {
          sub: CANARY,
          scp: 'canary_checkout',
          run: '42-1',
        })
      ),
      'canary_checkout',
      { consume: true }
    );
    expect(hoisted.walkLimit).toHaveBeenCalledWith('canary_checkout');
    expect(hoisted.limit).not.toHaveBeenCalled();
  });

  it('exposes rate_limited as the deny cause so callers name the budget, not auth drift (JOV-9826)', async () => {
    hoisted.walkLimit.mockResolvedValue({ success: false });
    const detailed = await resolveSyntheticPassageTokenDetailed(
      headersWith(
        mintPassageToken(derivePassageKey(hoisted.env.CRON_SECRET ?? ''), {
          sub: CANARY,
          scp: 'canary_reset',
          run: '42-1',
        })
      ),
      'canary_reset',
      { consume: true }
    );
    expect(detailed.grant).toBeNull();
    expect(detailed.denyCause).toBe('rate_limited');
    // The legacy wrapper keeps its null contract for the other callers.
    await expect(
      resolveSyntheticPassageToken(
        headersWith(
          mintPassageToken(derivePassageKey(hoisted.env.CRON_SECRET ?? ''), {
            sub: CANARY,
            scp: 'canary_reset',
            run: '42-1',
          })
        ),
        'canary_reset',
        { consume: true }
      )
    ).resolves.toBeNull();
  });

  it('exposes invalid_token for a bad signature so the route keeps the opaque 401', async () => {
    const detailed = await resolveSyntheticPassageTokenDetailed(
      headersWith(
        `${mintPassageToken(derivePassageKey(hoisted.env.CRON_SECRET ?? ''), {
          sub: CANARY,
          scp: 'canary_reset',
          run: '42-1',
        })}x`
      ),
      'canary_reset',
      { consume: true }
    );
    expect(detailed.grant).toBeNull();
    expect(detailed.denyCause).toBe('invalid_token');
    expect(hoisted.walkLimit).not.toHaveBeenCalled();
  });
});
