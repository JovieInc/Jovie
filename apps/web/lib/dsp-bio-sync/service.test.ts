import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  confirmationFor,
  type ProfileWriteReceipt,
} from '@/lib/connectors/profile-writes/contract';
import { getOwnedProfile } from './ownership';
import {
  approveBioSync,
  getBioSyncHistory,
  getBioSyncStatus,
  createDspBioWriteService as runner,
  syncBioToDsps,
} from './service';

const f = vi.hoisted(() => ({
  evidenced: false,
  expires: '',
  rows: [] as ProfileWriteReceipt[],
  rates: new Set<string>(),
  context: {
    bio: 'Current artist bio',
    displayName: 'Example Artist',
    username: 'artist',
    spotifyId: null,
    spotifyUrl: null,
    matchId: 'match',
    externalArtistId: 'artist-1',
    externalArtistUrl: null,
  },
  send: vi.fn(),
  select: vi.fn(),
  limit: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/session', () => ({
  withDbSessionTx: async (run: (tx: unknown) => unknown) =>
    run({ select: f.select }),
}));
vi.mock('@/lib/db', () => ({ db: { select: f.select } }));
vi.mock('@/lib/notifications/providers/resend', () => ({
  ResendEmailProvider: class {
    sendEmail = f.send;
  },
}));
vi.mock(
  '@/lib/connectors/profile-writes/destinations',
  async importOriginal => {
    const original =
      await importOriginal<
        typeof import('@/lib/connectors/profile-writes/destinations')
      >();
    return {
      ...original,
      getBioSubmissionManifest: vi.fn(id => ({
        ...original.getBioSubmissionManifest(id),
        termsApproved: f.evidenced,
        evidenceRef: f.evidenced ? 'fixture:terms-review' : '',
        evidenceExpiresAt: f.expires,
      })),
    };
  }
);
vi.mock('@/lib/connectors/profile-writes/ledger.server', () => ({
  profileWriteLedger: {
    async get(userId: string, proposalId: string, phase: string) {
      return structuredClone(
        f.rows.find(
          row =>
            row.proposal.userId === userId &&
            row.proposal.id === proposalId &&
            row.phase === phase
        ) ?? null
      );
    },
    async append(receipt: ProfileWriteReceipt, rateKey?: string) {
      if (
        f.rows.some(
          row =>
            row.proposal.id === receipt.proposal.id &&
            row.phase === receipt.phase
        ) ||
        (rateKey && f.rates.has(rateKey))
      )
        return false;
      if (rateKey) f.rates.add(rateKey);
      f.rows.push(structuredClone(receipt));
      return true;
    },
  },
}));

const req = {
  userId: 'user',
  creatorProfileId: 'profile',
  providerIds: ['spotify'],
};
beforeEach(() => {
  vi.clearAllMocks();
  f.evidenced = false;
  f.expires = new Date(Date.now() + 3600000).toISOString();
  f.rows.length = 0;
  f.rates.clear();
  f.context.bio = 'Current artist bio';
  f.context.externalArtistId = 'artist-1';
  f.limit.mockImplementation(async () => [{ ...f.context }]);
  const query = {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: f.limit,
  };
  f.select.mockReturnValue(query);
  f.send.mockResolvedValue({
    status: 'sent',
    detail: 'captured-message',
    channel: 'email',
    provider: 'resend',
  });
});
async function preview() {
  return (await syncBioToDsps(req)).results[0].proposal!;
}
async function approve(p: Awaited<ReturnType<typeof preview>>) {
  return approveBioSync({
    ...req,
    providerId: p.providerId,
    proposalId: p.id,
    confirmation: confirmationFor(p),
  });
}

describe('consented DSP bio submissions', () => {
  it('authorizes the current app user id rather than a retired identity', async () => {
    f.limit.mockResolvedValue([{ id: 'profile', userId: 'user', bio: 'Bio' }]);
    expect((await getOwnedProfile('profile', 'user')).status).toBe('ok');
    expect((await getOwnedProfile('profile', 'other')).status).toBe(
      'forbidden'
    );
  });

  it('persists a pending exact preview without sending or writing legacy records', async () => {
    const p = await preview();
    expect(p).toMatchObject({
      operation: 'email-submission',
      desired: { bio: 'Current artist bio' },
      destinationAccountId: 'artist-1',
    });
    expect(f.rows.map(row => row.phase)).toEqual(['proposal']);
    expect(f.send).not.toHaveBeenCalled();
    const { service } = await runner('user', 'profile', 'spotify');
    await expect(service.execute('user', p.id)).rejects.toThrow(
      'approval-required'
    );
  });

  it.each([false, true])(
    'blocks unverified delivery for default and explicit targets (%j)',
    async explicit => {
      const ids = ['amazon_music', 'apple_music', 'deezer', 'spotify', 'tidal'];
      const providerIds = explicit ? ids : undefined;
      if (!explicit) {
        f.select.mockReturnValueOnce({
          from: () => ({ where: async () => ids.map(id => ({ id })) }),
        });
      }
      const response = await syncBioToDsps({ ...req, providerIds });
      expect(response.pendingCount).toBe(ids.length);
      expect(response.results.map(result => result.providerId)).toEqual(ids);
      for (const result of response.results) {
        expect(result.status).toBe('pending');
        await expect(approve(result.proposal!)).rejects.toThrow(
          'unverified-manifest'
        );
      }
      expect(f.rows).toHaveLength(ids.length);
      expect(f.rows.every(row => row.phase === 'proposal')).toBe(true);
      expect(f.send).not.toHaveBeenCalled();
    }
  );

  it('does not prepare or send unsupported API methods', async () => {
    const response = await syncBioToDsps({
      ...req,
      providerIds: ['soundcloud', 'youtube_music'],
    });
    expect(response.results.map(row => row.status)).toEqual([
      'unsupported',
      'unsupported',
    ]);
    expect(f.rows).toEqual([]);
    expect(f.send).not.toHaveBeenCalled();
  });

  it('enforces field limits before persisting a proposal', async () => {
    await expect(
      syncBioToDsps({ ...req, bioText: 'Artist bio. '.repeat(140) })
    ).rejects.toThrow('invalid-submission-bio');
    expect(f.rows).toEqual([]);
    expect(f.send).not.toHaveBeenCalled();
  });

  it('submits one approved captured email and commits an audit receipt; duplicate approval cannot resend', async () => {
    f.evidenced = true;
    const p = await preview();
    const receipt = await approve(p);
    expect(receipt).toMatchObject({
      phase: 'outcome',
      result: 'submitted',
      after: null,
      providerReceipt: { statusCode: 202 },
    });
    expect(receipt.approvalId).toBeTruthy();
    expect(f.rows.map(row => row.phase)).toEqual([
      'proposal',
      'approval',
      'started',
      'outcome',
    ]);
    expect(f.send).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('Current artist bio'),
        idempotencyKey: receipt.idempotencyKey,
      })
    );
    await expect(approve(p)).rejects.toThrow('already-approved');
    const { service } = await runner('user', 'profile', 'spotify');
    expect(await service.execute('user', p.id)).toEqual(receipt);
    expect(f.send).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(receipt)).not.toContain('captured-message');
  });

  it.each(['bio', 'externalArtistId'] as const)(
    'blocks a stale %s before dispatch',
    async field => {
      f.evidenced = true;
      const p = await preview();
      f.context[field] = 'changed';
      if (field === 'bio') expect((await approve(p)).result).toBe('blocked');
      else await expect(approve(p)).rejects.toThrow('unauthorized-destination');
      expect(f.send).not.toHaveBeenCalled();
    }
  );

  it('claims the shared destination rate window across proposals', async () => {
    f.evidenced = true;
    const first = await preview();
    const second = await preview();
    expect((await approve(first)).result).toBe('submitted');
    expect(await approve(second)).toMatchObject({
      result: 'blocked',
      reason: 'rate-limited',
    });
    expect(f.send).toHaveBeenCalledTimes(1);
  });

  it('keeps history separate from new receipt status', async () => {
    const history = [{ providerId: 'spotify', status: 'sent' }];
    f.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ orderBy: async () => history }) }),
    });
    expect(await getBioSyncHistory('profile')).toEqual(history);
    f.evidenced = true;
    await approve(await preview());
    const rows = f.rows.toReversed().map(receipt => ({ receipt }));
    f.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ orderBy: async () => rows }) }),
    });
    expect(await getBioSyncStatus('profile', 'user')).toMatchObject([
      { providerId: 'spotify', status: 'submitted' },
    ]);
  });
});
