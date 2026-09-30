import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  store: vi.fn(),
  resolve: vi.fn(),
}));
vi.mock('./draft-store', () => ({
  loadAgentDraftForMutation: (...args: unknown[]) => mocks.load(...args),
  storeAgentReleaseLaunch: (...args: unknown[]) => mocks.store(...args),
}));
vi.mock('./release-resolution', () => ({
  resolveAgentRelease: (...args: unknown[]) => mocks.resolve(...args),
}));

import { prepareReleaseLaunch } from './release-launch';

const draftId = '9efebd98-39b7-4a77-8965-04b5aafad9ad';
const input = {
  draft_id: draftId,
  draft_token: 'private.token',
  goal: 'Launch the single',
  release_metadata: {
    title: 'Signal Fire',
    artist_name: 'The Artist',
    release_date: '2026-11-07',
    artwork_url: 'https://i.scdn.co/image/cover',
    upc: '00123456789012',
    dsp_links: {
      spotify: 'https://open.spotify.com/album/release-id',
    },
  },
};
const completeFacts = {
  source: 'release_metadata',
  content_type: null,
  title: 'Signal Fire',
  artist_name: 'The Artist',
  release_date: '2026-11-07',
  artwork_url: 'https://i.scdn.co/image/cover',
  upc: '00123456789012',
  dsp_links: {
    spotify: 'https://open.spotify.com/album/release-id',
  },
  artist_ids: {},
};
let row: {
  id: string;
  artistId: string;
  capabilityHash: string;
  preview: {
    artist_id: string;
    provider: 'spotify';
    external_id: string;
    display_name: string;
    source_url: string;
    image_url: string;
    bio: null;
    genres: string[];
    launch?: unknown;
  };
  acquisition: {
    agent_source: string;
    client: string;
    installation_id: string;
    referral_token: string;
    session_or_run_id: string;
    intent: string;
    first_touch: { source: string };
  };
  expiresAt: Date;
  claimedAt: null;
  createdAt: Date;
};

describe('release.prepare_launch', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    row = {
      id: draftId,
      artistId: 'spotify:artist-id',
      capabilityHash: 'not-public',
      preview: {
        artist_id: 'spotify:artist-id',
        provider: 'spotify',
        external_id: 'artist-id',
        display_name: 'The Artist',
        source_url: 'https://open.spotify.com/artist/artist-id',
        image_url: 'https://i.scdn.co/image/artist',
        bio: null,
        genres: [],
      },
      acquisition: {
        agent_source: 'mcp',
        client: 'claude',
        installation_id: 'install-1',
        referral_token: 'ref-1',
        session_or_run_id: 'run-1',
        intent: 'release_launch',
        first_touch: { source: 'agent' },
      },
      expiresAt: new Date('2026-10-07T00:00:00Z'),
      claimedAt: null,
      createdAt: new Date('2026-09-30T00:00:00Z'),
    };
    mocks.load.mockImplementation(async () => row);
    mocks.resolve.mockResolvedValue({
      status: 'resolved',
      facts: [completeFacts],
    });
    mocks.store.mockImplementation(async (_id, _token, _expected, launch) => {
      row.preview.launch = launch;
      return row;
    });
  });

  it('persists a useful unpublished visibility, release-page, and smart-link draft', async () => {
    const result = await prepareReleaseLaunch(input);
    expect(result).toMatchObject({
      status: 'launch_draft_ready',
      next_action: 'review_draft',
      draft_id: draftId,
      receipt_id: draftId,
      ownership: 'unverified',
      published_url: null,
      claim_url: null,
      acquisition: { ...row.acquisition, draft_id: draftId },
      release: {
        title: 'Signal Fire',
        artist_name: 'The Artist',
        release_date: '2026-11-07',
        artwork_url: 'https://i.scdn.co/image/cover',
        dsp_links: completeFacts.dsp_links,
      },
      visibility_page: {
        state: 'draft',
        url: null,
        headline: 'The Artist',
      },
      release_page: {
        state: 'draft',
        url: null,
        headline: 'Signal Fire by The Artist',
      },
      smart_link: {
        state: 'draft',
        url: null,
        headline: 'Listen to Signal Fire',
        links: completeFacts.dsp_links,
      },
      missing_fields: [],
      conflicts: [],
      questions: [],
      retryable: false,
    });
    expect(mocks.store).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toContain(input.draft_token);
    expect(JSON.stringify(result)).not.toContain(row.capabilityHash);
  });

  it('replays the stored result without another provider call or write', async () => {
    const first = await prepareReleaseLaunch(input);
    const second = await prepareReleaseLaunch({
      goal: input.goal,
      draft_token: input.draft_token,
      release_metadata: {
        dsp_links: input.release_metadata.dsp_links,
        upc: input.release_metadata.upc,
        artwork_url: input.release_metadata.artwork_url,
        release_date: input.release_metadata.release_date,
        artist_name: input.release_metadata.artist_name,
        title: input.release_metadata.title,
      },
      draft_id: input.draft_id,
    });
    expect(second).toEqual(first);
    expect(mocks.resolve).toHaveBeenCalledOnce();
    expect(mocks.store).toHaveBeenCalledOnce();
  });

  it('asks only for facts that remain missing', async () => {
    mocks.resolve.mockResolvedValueOnce({
      status: 'resolved',
      facts: [
        {
          ...completeFacts,
          release_date: null,
          artwork_url: null,
          dsp_links: {},
        },
      ],
    });
    const result = await prepareReleaseLaunch({
      ...input,
      release_metadata: { title: 'Signal Fire', artist_name: 'The Artist' },
    });
    expect(result).toMatchObject({
      status: 'draft_needs_input',
      next_action: 'provide_release_facts',
      missing_fields: ['artwork_url', 'release_date', 'dsp_links'],
    });
    if (result.status === 'error') throw new Error('Expected a launch draft');
    expect(result.questions.map(question => question.field)).toEqual([
      'artwork_url',
      'release_date',
      'dsp_links',
    ]);
  });

  it('surfaces conflicting identity facts without selecting a winner', async () => {
    mocks.resolve.mockResolvedValueOnce({
      status: 'resolved',
      facts: [
        {
          ...completeFacts,
          source: 'release_url',
          artist_ids: { spotify: 'different-artist' },
        },
        {
          ...completeFacts,
          source: 'release_metadata',
          title: 'Another Title',
          artwork_url: 'https://example.com/another-cover.jpg',
        },
      ],
    });
    const result = await prepareReleaseLaunch(input);
    expect(result).toMatchObject({
      status: 'draft_needs_input',
      release: { title: null, artwork_url: null },
      conflicts: [
        { field: 'title' },
        { field: 'artwork_url' },
        { field: 'artist_identity' },
      ],
    });
    if (result.status === 'error') throw new Error('Expected a launch draft');
    expect(result.missing_fields).not.toContain('title');
    expect(result.missing_fields).not.toContain('artwork_url');
    expect(result.questions.map(question => question.field)).toEqual([
      'title',
      'artwork_url',
      'artist_identity',
    ]);
  });

  it('fails closed for invalid capabilities and racing draft replacements', async () => {
    mocks.load.mockResolvedValueOnce(null);
    expect(await prepareReleaseLaunch(input)).toMatchObject({
      code: 'DRAFT_UNAVAILABLE',
      retryable: false,
    });
    mocks.store.mockImplementationOnce(async () => ({
      ...row,
      preview: {
        ...row.preview,
        launch: { inputFingerprint: 'another-request', result: {} },
      },
    }));
    expect(await prepareReleaseLaunch(input)).toMatchObject({
      code: 'DRAFT_CHANGED',
      retryable: true,
    });
  });

  it('rejects authority-bearing and malformed input before any draft read', async () => {
    for (const value of [
      { ...input, publish: true },
      { ...input, draft_id: 'not-a-uuid' },
      { ...input, release_metadata: {}, release_url: undefined },
      {
        ...input,
        release_metadata: {
          title: 'Signal Fire',
          artwork_url: 'http://insecure.example/cover.jpg',
        },
      },
    ]) {
      expect(await prepareReleaseLaunch(value)).toMatchObject({
        code: 'INVALID_INPUT',
        retryable: false,
      });
    }
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.store).not.toHaveBeenCalled();
  });
});
