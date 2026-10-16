import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCachedAuth } from '@/lib/auth/cached';
import { getOwnedProfile } from '@/lib/dsp-bio-sync/ownership';
import { approveBioSync, syncBioToDsps } from '@/lib/dsp-bio-sync/service';
import { GET, POST } from './route';

vi.mock('@/lib/auth/cached', () => ({ getCachedAuth: vi.fn() }));
vi.mock('@/lib/dsp-bio-sync/ownership', () => ({ getOwnedProfile: vi.fn() }));
vi.mock('@/lib/dsp-bio-sync/service', () => ({
  syncBioToDsps: vi.fn(),
  approveBioSync: vi.fn(),
  getBioSyncHistory: vi.fn(),
  getBioSyncStatus: vi.fn(),
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
const profileId = '29c9aa32-204e-48ba-93a2-d5f4c4958d02';
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCachedAuth).mockResolvedValue({
    userId: 'user',
    sessionId: 'session',
    orgId: null,
  });
  vi.mocked(getOwnedProfile).mockResolvedValue({
    status: 'ok',
    profile: { id: profileId, userId: 'user', bio: 'Current bio' },
  });
});
const post = (body: unknown) =>
  POST(
    new Request('https://example.test/api/dsp/bio-sync', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  );
describe('DSP bio endpoint', () => {
  it('discovers blocked capabilities from the shared catalog', async () => {
    const body = await (await GET()).json();
    expect(body.enabledCount).toBe(0);
    expect(body.providers).toHaveLength(7);
    expect(
      body.providers.every(
        (provider: { enabled: boolean }) => !provider.enabled
      )
    ).toBe(true);
  });
  it('creates previews with authenticated identity and never approves an initial request', async () => {
    vi.mocked(syncBioToDsps).mockResolvedValue({
      success: true,
      pendingCount: 1,
      results: [{ providerId: 'spotify', status: 'pending' }],
    });
    expect((await post({ profileId, providerIds: ['spotify'] })).status).toBe(
      202
    );
    expect(syncBioToDsps).toHaveBeenCalledWith({
      userId: 'user',
      creatorProfileId: profileId,
      providerIds: ['spotify'],
      bioText: undefined,
    });
    expect(approveBioSync).not.toHaveBeenCalled();
  });
  it('rejects implicit approval and foreign profiles', async () => {
    expect(
      (
        await post({
          profileId,
          proposalId: profileId,
          confirmation: 'a'.repeat(64),
        })
      ).status
    ).toBe(400);
    vi.mocked(getOwnedProfile).mockResolvedValue({ status: 'forbidden' });
    expect((await post({ profileId })).status).toBe(403);
    expect(syncBioToDsps).not.toHaveBeenCalled();
    expect(approveBioSync).not.toHaveBeenCalled();
  });
});
