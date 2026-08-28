import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSelect, mockDb } = vi.hoisted(() => {
  const mockSelect = vi.fn();
  return { mockSelect, mockDb: { select: mockSelect } };
});

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/constants/domains', () => ({
  getProfileUrl: (handle: string) => `https://jov.ie/${handle}`,
}));

import { executePresenceBuildStep } from './execute-step';

function chainSelect(result: unknown) {
  const terminal = {
    limit: vi.fn().mockResolvedValue(result),
    then: (resolve: (value: unknown) => unknown) => resolve(result),
  };
  const fromChain = {
    innerJoin: vi.fn(() => fromChain),
    where: vi.fn(() => terminal),
    limit: vi.fn().mockResolvedValue(result),
  };
  return { from: vi.fn(() => fromChain) };
}

const emptyProfile = {
  id: 'p1',
  username: 'ada',
  displayName: null as string | null,
  bio: null,
  avatarUrl: null,
  spotifyId: null,
  spotifyUrl: null,
};

describe('executePresenceBuildStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('drafts a welcome post only from real profile fields', async () => {
    mockSelect
      .mockReturnValueOnce(
        chainSelect([{ ...emptyProfile, displayName: 'Ada' }])
      )
      .mockReturnValueOnce(chainSelect([{ value: 2 }]))
      .mockReturnValueOnce(chainSelect([{ value: 1 }]));

    const artifact = await executePresenceBuildStep('draft_welcome_post', 'p1');
    expect(artifact.empty).toBeFalsy();
    expect(artifact.draftText).toContain("I'm Ada");
    expect(artifact.draftText).toContain('2 tracks');
    expect(artifact.draftText).toContain('https://jov.ie/ada');
    expect(artifact.draftText).not.toMatch(/10k|followers|monthly listeners/i);
  });

  it('returns an empty smart-link artifact when handle is missing', async () => {
    mockSelect.mockReturnValueOnce(
      chainSelect([{ ...emptyProfile, username: '' }])
    );
    const artifact = await executePresenceBuildStep(
      'generate_smart_link',
      'p1'
    );
    expect(artifact.empty).toBe(true);
    expect(artifact.href).toBeUndefined();
  });

  it('does not invent research facts when the profile has no sources', async () => {
    mockSelect
      .mockReturnValueOnce(chainSelect([emptyProfile]))
      .mockReturnValueOnce(chainSelect([]))
      .mockReturnValueOnce(chainSelect([]));

    const artifact = await executePresenceBuildStep('research_artist', 'p1');
    expect(artifact.empty).toBe(true);
    expect(artifact.facts).toEqual([]);
  });

  it('surfaces the truthful Library onboarding object without sending', async () => {
    mockSelect
      .mockReturnValueOnce(
        chainSelect([
          { kind: 'repair', status: 'open' },
          { kind: 'collision', status: 'open' },
          { kind: 'placement_opportunity', status: 'drafted' },
        ])
      )
      .mockReturnValueOnce(
        chainSelect([
          { evidenceClass: 'observed' },
          { evidenceClass: 'claimed' },
        ])
      )
      .mockReturnValueOnce(chainSelect([]));

    const artifact = await executePresenceBuildStep(
      'surface_library_opportunities',
      'p1'
    );

    expect(artifact.summary).toContain('nothing was sent');
    expect(artifact.facts).toEqual(
      expect.arrayContaining([
        { label: 'Repair queue', value: '1 open' },
        { label: 'Collisions', value: '1 to review' },
        { label: 'Placement opportunities', value: '1 found' },
        { label: 'Rightsholders', value: '1 observed' },
        { label: 'Downloads', value: 'No attested files live' },
        { label: 'Stats', value: 'Not connected' },
      ])
    );
    expect(JSON.stringify(artifact)).not.toMatch(/streams|revenue|license/i);
  });
});
