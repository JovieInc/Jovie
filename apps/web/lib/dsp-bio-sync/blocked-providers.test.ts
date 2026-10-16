import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfileWriteReceipt } from '@/lib/connectors/profile-writes/contract';

const emailProviders = [
  'amazon_music',
  'apple_music',
  'deezer',
  'spotify',
  'tidal',
];
const { insert, sendEmail, queryProfile, rows } = vi.hoisted(() => ({
  insert: vi.fn(),
  sendEmail: vi.fn(),
  queryProfile: vi.fn(),
  rows: [] as ProfileWriteReceipt[],
}));
vi.mock('@/lib/db', () => ({
  db: {
    insert,
    select: () => ({
      from: () => ({
        where: async () => emailProviders.map(id => ({ id })),
        innerJoin: () => ({ where: () => ({ limit: queryProfile }) }),
      }),
    }),
  },
}));
vi.mock('@/lib/connectors/profile-writes/ledger.server', () => ({
  profileWriteLedger: {
    async get(userId: string, proposalId: string, phase: string) {
      return (
        rows.find(
          row =>
            row.proposal.userId === userId &&
            row.proposal.id === proposalId &&
            row.phase === phase
        ) ?? null
      );
    },
    async append(receipt: ProfileWriteReceipt) {
      rows.push(structuredClone(receipt));
      return true;
    },
  },
}));
vi.mock('@/lib/notifications/providers/resend', () => ({
  ResendEmailProvider: class {
    sendEmail = sendEmail;
  },
}));

import { approveBioSync, syncBioToDsps } from './service';

beforeEach(() => {
  vi.clearAllMocks();
  rows.length = 0;
  queryProfile.mockResolvedValue([
    {
      bio: 'Artist biography',
      displayName: 'Artist',
      username: 'artist',
      spotifyId: null,
      spotifyUrl: null,
      matchId: 'match',
      externalArtistId: 'artist-1',
      externalArtistUrl: null,
    },
  ]);
});

describe('unverified DSP bio delivery', () => {
  it.each([
    { providerIds: undefined },
    { providerIds: emailProviders },
    { providerIds: ['soundcloud', 'youtube_music'] },
  ])(
    'blocks delivery for explicit and default provider selection (%j)',
    async ({ providerIds }) => {
      const request = { userId: 'user', creatorProfileId: 'profile' };
      const response = await syncBioToDsps({ ...request, providerIds });
      const targets = providerIds ?? emailProviders;
      expect(response.success).toBe(true);
      expect(response.results.map(result => result.providerId)).toEqual(
        targets
      );
      expect(response.pendingCount).toBe(
        targets.filter(id => emailProviders.includes(id)).length
      );
      for (const result of response.results) {
        if (emailProviders.includes(result.providerId)) {
          expect(result.status).toBe('pending');
          expect(result.proposal).toMatchObject({
            operation: 'email-submission',
            desired: { bio: 'Artist biography' },
          });
          await expect(
            approveBioSync({
              ...request,
              providerId: result.providerId,
              proposalId: result.proposal!.id,
              confirmation: result.confirmation!,
            })
          ).rejects.toThrow('unverified-manifest');
        } else {
          expect(result).toEqual({
            providerId: result.providerId,
            status: 'unsupported',
          });
        }
      }
      expect(rows).toHaveLength(response.pendingCount);
      expect(rows.every(row => row.phase === 'proposal')).toBe(true);
      expect(insert).not.toHaveBeenCalled();
      expect(sendEmail).not.toHaveBeenCalled();
    }
  );
});
