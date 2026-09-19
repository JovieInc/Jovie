import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { select, update, tables } = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
  tables: { profiles: {}, links: {}, attributes: {}, leads: {} },
}));
vi.mock('@/lib/db', () => ({ db: { select, update } }));
vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: tables.profiles,
  creatorProfileAttributes: tables.attributes,
}));
vi.mock('@/lib/db/schema/links', () => ({ socialLinks: tables.links }));
vi.mock('@/lib/db/schema/leads', () => ({ leads: tables.leads }));
vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  eq: vi.fn(),
  inArray: vi.fn(),
  isNull: vi.fn(),
}));
vi.mock('@/constants/domains', () => ({
  getAppUrl: (path: string) => `https://jov.ie${path}`,
}));

import {
  loadProfileCompleteness,
  reassessProfileCompleteness,
  requireLeadCompleteness,
  requireProfileCompleteness,
} from './completeness.server';
import {
  PROFILE_COMPLETENESS_POLICY,
  type ProfileCompletenessJudgment,
} from './completeness-certification';

const id = '11111111-1111-4111-8111-111111111111';
let profile: {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  userId: string | null;
  profileEditVersion: number;
  updatedAt: Date;
  judgment: ProfileCompletenessJudgment | null;
};
let destinations: {
  profileId: string;
  platform: string;
  url: string;
  id: string;
  version: number;
}[];
let sourceRows: {
  profileId: string;
  id: string;
  url: string;
  linktreeUrl?: string;
}[];
describe('current completeness snapshot at consumer boundaries', () => {
  beforeEach(() => {
    profile = {
      id,
      username: 'riverlane',
      displayName: 'River Lane',
      avatarUrl: 'https://cdn.jov.ie/river.jpg',
      bio: 'Independent soul artist from Atlanta.',
      userId: null,
      profileEditVersion: 1,
      updatedAt: new Date('2026-09-19T00:00:00Z'),
      judgment: null,
    };
    destinations = [
      {
        profileId: id,
        platform: 'spotify',
        url: 'https://open.spotify.com/artist/river',
        id: 'link-1',
        version: 1,
      },
    ];
    sourceRows = [
      { profileId: id, id: 'lead-1', url: 'https://linktr.ee/riverlane' },
    ];
    update.mockReset().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id }]),
        }),
      }),
    });
    select.mockReset().mockImplementation(() => ({
      from: (table: unknown) => ({
        where: () => {
          const rows =
            table === tables.profiles
              ? [profile]
              : table === tables.links
                ? destinations
                : table === tables.leads
                  ? sourceRows
                  : [];
          return Object.assign(Promise.resolve(rows), {
            limit: () => Promise.resolve(rows),
          });
        },
      }),
    }));
  });
  async function certify() {
    const result = (await loadProfileCompleteness([id])).get(id)!;
    profile.judgment = {
      schemaVersion: PROFILE_COMPLETENESS_POLICY,
      policyVersion: PROFILE_COMPLETENESS_POLICY,
      profileId: id,
      snapshotSha256: result.snapshotSha256,
      evaluatedAt: new Date().toISOString(),
      model: 'typesafe-ai/jev',
      transportStatus: 'evaluated',
      verdict: 'supported',
      reasons: ['jev_supported'],
      confidence: null,
    };
  }
  it('persists a matching assessment without changing the profile revision', async () => {
    await certify();
    const receipt = profile.judgment!;
    profile.judgment = null;
    const evaluate = vi.fn().mockResolvedValue(receipt);
    expect((await reassessProfileCompleteness(id, evaluate)).status).toBe(
      'evaluated'
    );
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.results[0]!.value.set).toHaveBeenCalledWith({
      completenessJudgment: receipt,
    });
  });
  it('does not evaluate incomplete or already current profiles', async () => {
    const evaluate = vi.fn();
    await certify();
    expect((await reassessProfileCompleteness(id, evaluate)).status).toBe(
      'current'
    );
    profile.avatarUrl = null;
    expect((await reassessProfileCompleteness(id, evaluate)).status).toBe(
      'incomplete'
    );
    expect(evaluate).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
  it('discards an evaluation if content changed during the model call', async () => {
    await certify();
    const receipt = profile.judgment!;
    profile.judgment = null;
    const evaluate = vi.fn(async () => {
      profile.bio += ' New release.';
      return receipt;
    });
    expect((await reassessProfileCompleteness(id, evaluate)).status).toBe(
      'changed'
    );
    expect(update).not.toHaveBeenCalled();
  });
  it('rejects malformed model receipts and propagates transport failure without saving', async () => {
    expect(
      (await reassessProfileCompleteness(id, vi.fn().mockResolvedValue({})))
        .status
    ).toBe('invalid_evaluation');
    await expect(
      reassessProfileCompleteness(
        id,
        vi.fn().mockRejectedValue(new Error('transport failed'))
      )
    ).rejects.toThrow('transport failed');
    expect(update).not.toHaveBeenCalled();
  });
  it('keeps complete unclaimed generated profiles blocked until evaluated', async () => {
    await expect(requireProfileCompleteness(id)).rejects.toThrow(
      'certification required'
    );
    await certify();
    await expect(requireProfileCompleteness(id)).resolves.toBeUndefined();
    await expect(requireLeadCompleteness('lead-1')).resolves.toBeUndefined();
  });
  it('blocks immediately after a photo removal or revision change', async () => {
    await certify();
    profile.avatarUrl = null;
    await expect(requireProfileCompleteness(id)).rejects.toThrow(
      'certification required'
    );
    profile.avatarUrl = 'https://cdn.jov.ie/river.jpg';
    profile.profileEditVersion++;
    await expect(requireProfileCompleteness(id)).rejects.toThrow(
      'certification required'
    );
  });
  it('invalidates link edits and missing public-source provenance', async () => {
    await certify();
    destinations[0]!.version++;
    await expect(requireProfileCompleteness(id)).rejects.toThrow(
      'certification required'
    );
    await certify();
    sourceRows = [];
    await expect(requireProfileCompleteness(id)).rejects.toThrow(
      'certification required'
    );
  });
  it('does not turn missing data or read failures into an eligible profile', async () => {
    await expect(requireProfileCompleteness(null)).rejects.toThrow(
      'certification required'
    );
    expect(await loadProfileCompleteness([])).toEqual(new Map());
    select.mockImplementation(() => {
      throw new Error('database unavailable');
    });
    await expect(requireProfileCompleteness(id)).rejects.toThrow(
      'database unavailable'
    );
  });
  it('accepts an authenticated creator source independently of claim or billing flags', async () => {
    sourceRows = [];
    profile.userId = 'owner-1';
    await certify();
    expect((await loadProfileCompleteness([id])).get(id)?.eligible).toBe(true);
  });
});
