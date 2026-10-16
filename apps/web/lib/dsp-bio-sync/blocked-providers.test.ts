import { describe, expect, it, vi } from 'vitest';

const { insert, sendEmail, queryProfile } = vi.hoisted(() => ({
  insert: vi.fn(),
  sendEmail: vi.fn(),
  queryProfile: vi.fn(),
}));
vi.mock('@/lib/db', () => ({
  db: {
    insert,
    select: () => ({
      from: () => ({ where: () => ({ limit: queryProfile }) }),
    }),
  },
}));
vi.mock('@/lib/notifications/providers/resend', () => ({
  ResendEmailProvider: class {
    sendEmail = sendEmail;
  },
}));
vi.mock('@/lib/copy/outbound-floor', () => ({
  assertCustomerVoiceFloor: vi.fn(),
}));

import { syncBioToDsps } from './service';

describe('unverified DSP bio delivery', () => {
  it.each([
    { providerIds: undefined },
    {
      providerIds: [
        'amazon_music',
        'apple_music',
        'deezer',
        'spotify',
        'tidal',
      ],
    },
    { providerIds: ['soundcloud', 'youtube_music'] },
  ])(
    'blocks explicit and default provider selection (%j)',
    async ({ providerIds }) => {
      queryProfile.mockResolvedValueOnce([
        {
          id: 'profile',
          bio: 'Artist biography',
          displayName: 'Artist',
          username: 'artist',
          spotifyId: null,
          spotifyUrl: null,
        },
      ]);
      expect(
        await syncBioToDsps({ creatorProfileId: 'profile', providerIds })
      ).toEqual({
        success: true,
        results: [],
        sentCount: 0,
        failedCount: 0,
      });
      expect(insert).not.toHaveBeenCalled();
      expect(sendEmail).not.toHaveBeenCalled();
    }
  );
});
