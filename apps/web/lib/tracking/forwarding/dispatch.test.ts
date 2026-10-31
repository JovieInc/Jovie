import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeEvent } from '@/tests/unit/lib/tracking/forwarding/test-helpers';
import { readTrackingProfile } from '../eligibility.server';
import { dispatchToVendor } from './dispatch';

const send = vi.hoisted(() => vi.fn().mockResolvedValue({ success: true }));
vi.mock('../eligibility.server', () => ({ readTrackingProfile: vi.fn() }));
vi.mock('./facebook', () => ({ forwardToFacebook: send }));
vi.mock('./google', () => ({ forwardToGoogle: send }));
vi.mock('./tiktok', () => ({ forwardToTikTok: send }));
const config = {
  pixelId: 'synthetic',
  accessToken: 'synthetic',
  enabled: true,
};
beforeEach(() => vi.clearAllMocks());
describe('all conversion transports share live policy', () => {
  it.each(['facebook', 'google', 'tiktok'] as const)(
    'revokes %s even for a queued event with warm config',
    async vendor => {
      vi.mocked(readTrackingProfile)
        .mockResolvedValueOnce({ youngAudience: false })
        .mockResolvedValueOnce({ youngAudience: true });
      const event = makeEvent();
      await dispatchToVendor(vendor, event, config, 'artist', {
        consent: { analytics: true, marketing: true },
      });
      expect(send).toHaveBeenCalledTimes(1);
      const result = await dispatchToVendor(vendor, event, config, 'artist', {
        consent: { analytics: true, marketing: true },
      });
      expect(result.skipped).toBe(true);
      expect(send).toHaveBeenCalledTimes(1);
      expect(readTrackingProfile).toHaveBeenCalledTimes(2);
    }
  );
  it.each([{ gpc: true }, { optOut: true }, { consentRequired: true }])(
    'rejects visitor denial %j',
    async visitor => {
      vi.mocked(readTrackingProfile).mockResolvedValue({
        youngAudience: false,
      });
      await dispatchToVendor(
        'facebook',
        makeEvent(),
        config,
        'artist',
        visitor
      );
      expect(send).not.toHaveBeenCalled();
    }
  );
  it('never sends on missing or failed authority', async () => {
    vi.mocked(readTrackingProfile)
      .mockResolvedValueOnce(undefined!)
      .mockRejectedValueOnce(new Error('offline'));
    expect(
      (await dispatchToVendor('google', makeEvent(), config, 'artist', {}))
        .skipped
    ).toBe(true);
    await expect(
      dispatchToVendor('google', makeEvent(), config, 'artist', {})
    ).rejects.toThrow('offline');
    expect(send).not.toHaveBeenCalled();
  });
});
