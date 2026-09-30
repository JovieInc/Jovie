import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  resolve: vi.fn(),
}));
vi.mock('@/lib/db', () => ({
  db: { select: mocks.select, insert: mocks.insert },
}));
vi.mock('./artist-resolution', () => ({ resolveAgentArtist: mocks.resolve }));

import { draftTokenHash, mintDraftCapability } from './draft-capability';
import { createAgentDraft, readAgentDraft } from './draft-store';

const artistId = 'spotify:4Z8W4fKeB5YxbusRsdQVPb';
const artist = {
  artist_id: artistId,
  provider: 'spotify',
  external_id: artistId.slice(8),
  display_name: 'Artist',
  source_url: 'https://open.spotify.com/artist/' + artistId.slice(8),
  image_url: null,
  bio: null,
  genres: [],
};
const resolution = { status: 'resolved', artist, retryable: false };
const acquisition = { agent_source: 'mcp', first_touch: { source: 'agent' } };
function grant() {
  const { token, capability } = mintDraftCapability(artistId, acquisition);
  return {
    token,
    capability,
    input: { artist_id: artistId, draft_token: token },
    row: {
      id: capability.draft_id,
      artistId,
      capabilityHash: draftTokenHash(token),
      preview: artist,
      acquisition,
      expiresAt: new Date(capability.expires_at),
      claimedAt: null,
      createdAt: new Date(),
    },
  };
}
let reads = vi.fn();
let writes = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  reads = vi.fn().mockResolvedValue([]);
  writes = vi.fn().mockResolvedValue(undefined);
  mocks.select.mockReturnValue({
    from: () => ({ where: () => ({ limit: reads }) }),
  });
  mocks.insert.mockReturnValue({
    values: (value: unknown) => ({ onConflictDoNothing: () => writes(value) }),
  });
  mocks.resolve.mockResolvedValue(resolution);
});
afterEach(() => vi.useRealTimers());
describe('capability-bound draft persistence', () => {
  it('preserves the selected Apple storefront through draft creation', async () => {
    const id = 'apple_music:657515';
    const { token } = mintDraftCapability(id, {}, Date.now(), 'gb');
    await createAgentDraft({ artist_id: id, draft_token: token });
    expect(mocks.resolve).toHaveBeenCalledExactlyOnceWith({
      input: 'https://music.apple.com/gb/artist/657515',
    });
  });
  it('persists one unpublished public preview with provenance and returns a resumable receipt', async () => {
    const g = grant();
    reads.mockResolvedValueOnce([]).mockResolvedValueOnce([g.row]);
    const result = await createAgentDraft(g.input);
    expect(result).toMatchObject({
      status: 'draft_ready',
      draft_id: g.row.id,
      receipt_id: g.row.id,
      artist,
      ownership: 'unverified',
      published_url: null,
      claim_url: null,
      missing_fields: ['bio', 'image_url'],
      acquisition: { ...acquisition, draft_id: g.row.id },
    });
    expect(writes).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        id: g.row.id,
        capabilityHash: draftTokenHash(g.token),
        acquisition,
      })
    );
    expect(JSON.stringify(result)).not.toContain(g.token);
    expect(JSON.stringify(result)).not.toContain(g.row.capabilityHash);
  });
  it('replays persisted results without another provider call or write', async () => {
    const g = grant();
    reads.mockResolvedValue([g.row]);
    expect(await createAgentDraft(g.input)).toEqual(
      await readAgentDraft(g.row.id, g.token)
    );
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it('denies artist substitution, unrelated receipt IDs, expiry and malformed inputs before DB access', async () => {
    const g = grant();
    expect(await createAgentDraft({ ...g.input, publish: true })).toMatchObject(
      { code: 'INVALID_INPUT' }
    );
    expect(
      await createAgentDraft({ ...g.input, artist_id: 'apple_music:657515' })
    ).toMatchObject({ code: 'DRAFT_UNAVAILABLE' });
    expect(await readAgentDraft('another-id', g.token)).toMatchObject({
      code: 'DRAFT_UNAVAILABLE',
    });
    expect(await readAgentDraft(g.row.id, 'forged')).toMatchObject({
      code: 'DRAFT_UNAVAILABLE',
    });
    vi.useFakeTimers();
    vi.setSystemTime(g.capability.expires_at);
    expect(await createAgentDraft(g.input)).toMatchObject({
      code: 'DRAFT_UNAVAILABLE',
    });
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it('does not report success for a missing, claimed or conflicting persisted row', async () => {
    const g = grant();
    expect(await createAgentDraft(g.input)).toMatchObject({
      code: 'DRAFT_UNAVAILABLE',
    });
    expect(await readAgentDraft(g.row.id, g.token)).toMatchObject({
      code: 'DRAFT_UNAVAILABLE',
    });
  });
  it('does not persist when upstream fails or the grant expires during provider I/O', async () => {
    const g = grant();
    mocks.resolve.mockResolvedValueOnce({
      status: 'error',
      code: 'UPSTREAM_FAILURE',
      retryable: true,
    });
    expect(await createAgentDraft(g.input)).toMatchObject({
      code: 'UPSTREAM_FAILURE',
    });
    mocks.resolve.mockImplementationOnce(async () => {
      vi.useFakeTimers();
      vi.setSystemTime(g.capability.expires_at);
      return resolution;
    });
    expect(await createAgentDraft(g.input)).toMatchObject({
      code: 'DRAFT_UNAVAILABLE',
    });
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it('propagates persistence failures to the sanitized API failure boundary', async () => {
    const g = grant();
    writes.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(createAgentDraft(g.input)).rejects.toThrow(
      'database unavailable'
    );
  });
});
