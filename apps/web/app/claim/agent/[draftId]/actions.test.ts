import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  userId: 'user_1' as string | null,
  limit: { success: true },
  claim: vi.fn(),
  capture: vi.fn(),
}));

class Redirect extends Error {
  constructor(readonly to: string) {
    super(to);
  }
}

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Redirect(to);
  },
}));
vi.mock('@/lib/auth/cached', () => ({
  getOptionalAuth: async () => ({ userId: h.userId }),
}));
vi.mock('@/lib/agent-acquisition/draft-claim.server', () => ({
  claimAgentDraft: (...args: unknown[]) => h.claim(...args),
}));
vi.mock('@/lib/error-tracking', () => ({
  captureError: (...args: unknown[]) => h.capture(...args),
}));
vi.mock('@/lib/rate-limit', () => ({
  claimTokenAccessLimiter: { limit: async () => h.limit },
  allowIfRateLimitBackendDegraded: (r: unknown) => r,
}));

import { claimAgentDraftAction } from './actions';

const draftId = '9efebd98-39b7-4a77-8965-04b5aafad9ad';
const handoff = 'Besf6yDvKw9YeXFyVLdKhGRgi-LjGGtu_CCLOElEqPI';
const digest = 'Wn0aWl0n7d5j2C3TzMvCw2yYk0b2k2n2tQ8o3m3e8xQ';

const form = (over: Record<string, string> = {}) => {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    draftId,
    h: handoff,
    p: digest,
    ...over,
  }))
    f.set(k, v);
  return f;
};
const run = async (f: FormData) => {
  try {
    await claimAgentDraftAction(f);
  } catch (e) {
    if (e instanceof Redirect) return e.to;
    throw e;
  }
  throw new Error('no redirect');
};

describe('claimAgentDraftAction', () => {
  beforeEach(() => {
    h.userId = 'user_1';
    h.limit = { success: true };
    h.claim.mockReset();
    h.capture.mockReset();
  });

  it('sends malformed input to /start without echoing it', async () => {
    expect(await run(form({ draftId: 'evil//x' }))).toBe('/start');
    expect(await run(form({ h: 'short' }))).toBe('/start');
    expect(h.claim).not.toHaveBeenCalled();
  });

  it('sends signed-out users to sign up with a return path', async () => {
    h.userId = null;
    expect(await run(form())).toContain('redirect_url=');
  });

  it('returns retry_later when rate limited', async () => {
    h.limit = { success: false };
    expect(await run(form())).toMatch(/&e=retry_later$/);
  });

  it('treats a bad digest as draft_changed without claiming', async () => {
    expect(await run(form({ p: 'nope' }))).toMatch(/&e=draft_changed$/);
    expect(h.claim).not.toHaveBeenCalled();
  });

  it.each([
    [{ status: 'claimed' }, '/app'],
    [{ status: 'existing_profile', handle: 'a b' }, '/a%20b/claim?next=auth'],
    [{ status: 'verification_required', spotifyId: 'sp1' }, 'spotify=sp1'],
    [{ status: 'artist_taken' }, '&e=artist_taken'],
  ])('maps %j', async (result, expected) => {
    h.claim.mockResolvedValue(result);
    expect(await run(form())).toContain(expected);
  });

  it('captures the error and returns retry_later when the claim throws', async () => {
    h.claim.mockRejectedValue(new Error('boom'));
    expect(await run(form())).toMatch(/&e=retry_later$/);
    expect(h.capture).toHaveBeenCalled();
  });
});
