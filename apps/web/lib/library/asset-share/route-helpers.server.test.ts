import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const authMocks = vi.hoisted(() => ({
  getSessionContext: vi.fn(),
}));

const shareServerMocks = vi.hoisted(() => ({
  loadArtistHandleForProfile: vi.fn(),
}));

const captureErrorMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth/session', () => ({
  getSessionContext: authMocks.getSessionContext,
}));

vi.mock('@/lib/library/asset-share.server', () => ({
  loadArtistHandleForProfile: shareServerMocks.loadArtistHandleForProfile,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: captureErrorMock,
}));

import {
  parseLibraryAssetShareRequest,
  resolveLibraryAssetShareActor,
  runLibraryAssetShareMutation,
} from './route-helpers.server';

const OWNED_PROFILE_ID = '11111111-1111-4111-8111-111111111111';

describe('resolveLibraryAssetShareActor (asset-share auth boundary)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 without loading the artist handle when the caller has no creator profile', async () => {
    authMocks.getSessionContext.mockResolvedValue({ profile: null });

    const actor = await resolveLibraryAssetShareActor(
      'clerk_user_1',
      OWNED_PROFILE_ID
    );

    expect(actor.ok).toBe(false);
    if (!actor.ok) {
      expect(actor.response.status).toBe(403);
      await expect(actor.response.json()).resolves.toEqual({
        error: 'Creator profile not found',
      });
    }
    expect(shareServerMocks.loadArtistHandleForProfile).not.toHaveBeenCalled();
  });

  it('returns 403 without loading the artist handle when the session profile does not match the requested profileId', async () => {
    authMocks.getSessionContext.mockResolvedValue({
      profile: { id: 'someone-elses-profile-id' },
    });

    const actor = await resolveLibraryAssetShareActor(
      'clerk_user_1',
      OWNED_PROFILE_ID
    );

    expect(actor.ok).toBe(false);
    if (!actor.ok) {
      expect(actor.response.status).toBe(403);
      await expect(actor.response.json()).resolves.toEqual({
        error: 'Creator profile not found',
      });
    }
    expect(shareServerMocks.loadArtistHandleForProfile).not.toHaveBeenCalled();
  });

  it('returns 400 when the owning profile has no resolvable artist handle', async () => {
    authMocks.getSessionContext.mockResolvedValue({
      profile: { id: OWNED_PROFILE_ID },
    });
    shareServerMocks.loadArtistHandleForProfile.mockResolvedValue(null);

    const actor = await resolveLibraryAssetShareActor(
      'clerk_user_1',
      OWNED_PROFILE_ID
    );

    expect(actor.ok).toBe(false);
    if (!actor.ok) {
      expect(actor.response.status).toBe(400);
      await expect(actor.response.json()).resolves.toEqual({
        error: 'Artist handle not found',
      });
    }
  });

  it('returns ok:true with the artist handle for the owning profile (happy path)', async () => {
    authMocks.getSessionContext.mockResolvedValue({
      profile: { id: OWNED_PROFILE_ID },
    });
    shareServerMocks.loadArtistHandleForProfile.mockResolvedValue('tim');

    const actor = await resolveLibraryAssetShareActor(
      'clerk_user_1',
      OWNED_PROFILE_ID
    );

    expect(actor).toEqual({ ok: true, artistHandle: 'tim' });
  });
});

describe('parseLibraryAssetShareRequest', () => {
  const schema = z.object({ profileId: z.string().uuid() });

  it('returns a 400 response for an invalid payload', async () => {
    const result = await parseLibraryAssetShareRequest(
      new Request('http://localhost/x', {
        method: 'POST',
        body: JSON.stringify({ profileId: 'not-a-uuid' }),
      }),
      schema
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
    }
  });

  it('returns the parsed data for a valid payload', async () => {
    const result = await parseLibraryAssetShareRequest(
      new Request('http://localhost/x', {
        method: 'POST',
        body: JSON.stringify({ profileId: OWNED_PROFILE_ID }),
      }),
      schema
    );

    expect(result).toEqual({ ok: true, data: { profileId: OWNED_PROFILE_ID } });
  });
});

describe('runLibraryAssetShareMutation (unauthorized short-circuit)', () => {
  const schema = z.object({ profileId: z.string().uuid() });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the actor response and never calls mutate when the actor is unauthorized', async () => {
    authMocks.getSessionContext.mockResolvedValue({
      profile: { id: 'someone-elses-profile-id' },
    });
    const mutate = vi.fn();

    const response = await runLibraryAssetShareMutation({
      request: new Request('http://localhost/api/library/asset-share', {
        method: 'POST',
        body: JSON.stringify({ profileId: OWNED_PROFILE_ID }),
      }),
      clerkUserId: 'clerk_user_1',
      schema,
      route: '/api/library/asset-share',
      captureMessage: 'test capture message',
      errorMessage: 'test error message',
      mutate,
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'Creator profile not found',
    });
    expect(mutate).not.toHaveBeenCalled();
  });

  it('calls mutate and returns { ok: true, share } when the actor is authorized (happy path)', async () => {
    authMocks.getSessionContext.mockResolvedValue({
      profile: { id: OWNED_PROFILE_ID },
    });
    shareServerMocks.loadArtistHandleForProfile.mockResolvedValue('tim');
    const share = { assetId: 'release-1', visibility: 'private' };
    const mutate = vi.fn().mockResolvedValue(share);

    const response = await runLibraryAssetShareMutation({
      request: new Request('http://localhost/api/library/asset-share', {
        method: 'POST',
        body: JSON.stringify({ profileId: OWNED_PROFILE_ID }),
      }),
      clerkUserId: 'clerk_user_1',
      schema,
      route: '/api/library/asset-share',
      captureMessage: 'test capture message',
      errorMessage: 'test error message',
      mutate,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, share });
    expect(mutate).toHaveBeenCalledWith({ profileId: OWNED_PROFILE_ID }, 'tim');
  });

  it('captures the error and returns 500 without leaking internals when mutate throws', async () => {
    authMocks.getSessionContext.mockResolvedValue({
      profile: { id: OWNED_PROFILE_ID },
    });
    shareServerMocks.loadArtistHandleForProfile.mockResolvedValue('tim');
    const mutate = vi.fn().mockRejectedValue(new Error('db exploded'));

    const response = await runLibraryAssetShareMutation({
      request: new Request('http://localhost/api/library/asset-share', {
        method: 'POST',
        body: JSON.stringify({ profileId: OWNED_PROFILE_ID }),
      }),
      clerkUserId: 'clerk_user_1',
      schema,
      route: '/api/library/asset-share',
      captureMessage: 'test capture message',
      errorMessage: 'test error message',
      mutate,
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'test error message',
    });
    expect(captureErrorMock).toHaveBeenCalledWith(
      'test capture message',
      expect.any(Error),
      { route: '/api/library/asset-share' }
    );
  });
});
