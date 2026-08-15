import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getReleasesForProfileMock: vi.fn(),
  upsertReleaseMock: vi.fn(),
  upsertRecordingMock: vi.fn(),
  upsertReleaseTrackMock: vi.fn(),
  generateUniqueSlugMock: vi.fn(),
  inferAudioEntityMock: vi.fn(),
  buildAudioUploadPromptMock: vi.fn(),
  revalidateTagMock: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidateTag: hoisted.revalidateTagMock,
}));

vi.mock('@/lib/cache/tags', () => ({
  createSmartLinkContentTag: (profileId: string) =>
    `smart-link-content:${profileId}`,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('@/lib/db/schema/content', () => ({
  discogReleases: { id: 'release.id', creatorProfileId: 'release.creatorId' },
  discogReleaseTracks: {
    releaseId: 'releaseTrack.releaseId',
    recordingId: 'releaseTrack.recordingId',
    discNumber: 'releaseTrack.discNumber',
    trackNumber: 'releaseTrack.trackNumber',
  },
  discogRecordings: {
    id: 'recording.id',
    creatorProfileId: 'recording.creatorId',
    previewUrl: 'recording.previewUrl',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  eq: vi.fn(),
}));

vi.mock('@/lib/chat/infer-audio-entity', () => ({
  inferAudioEntity: hoisted.inferAudioEntityMock,
  buildAudioUploadPrompt: hoisted.buildAudioUploadPromptMock,
}));

vi.mock('@/lib/discography/queries', () => ({
  getReleasesForProfile: hoisted.getReleasesForProfileMock,
  upsertRecording: hoisted.upsertRecordingMock,
  upsertRelease: hoisted.upsertReleaseMock,
  upsertReleaseTrack: hoisted.upsertReleaseTrackMock,
}));

vi.mock('@/lib/discography/slug', () => ({
  generateUniqueSlug: hoisted.generateUniqueSlugMock,
}));

describe('routeChatAudioUpload', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    hoisted.getReleasesForProfileMock.mockResolvedValue([]);
    hoisted.generateUniqueSlugMock.mockResolvedValue('generated-slug');
    hoisted.upsertReleaseMock.mockResolvedValue({
      id: 'release_1',
      title: 'Take Me Over',
    });
    hoisted.upsertRecordingMock.mockResolvedValue({ id: 'recording_1' });
    hoisted.upsertReleaseTrackMock.mockResolvedValue(undefined);
    hoisted.inferAudioEntityMock.mockReturnValue({
      kind: 'new',
      suggestedTitle: 'Take Me Over',
    });
    hoisted.buildAudioUploadPromptMock.mockReturnValue('prompt');
  });

  async function run(fileMimeType: string, fileName = 'take-me-over.mp3') {
    const { routeChatAudioUpload } = await import(
      '@/lib/chat/route-audio-upload'
    );
    return routeChatAudioUpload({
      clerkUserId: 'clerk_user_123',
      profileId: 'profile_123',
      blobUrl: 'https://cdn.example.com/take-me-over.mp3',
      blobPathname: 'library/audio/take-me-over.mp3',
      fileName,
      fileMimeType,
      fileSizeBytes: 1024,
    });
  }

  it('stores the canonical MIME when the caller sends a blank MIME', async () => {
    const result = await run('');

    expect(result.releaseId).toBe('release_1');
    expect(hoisted.upsertRecordingMock).toHaveBeenCalledWith(
      expect.objectContaining({ audioFormat: 'audio/mpeg' })
    );
  });

  it('stores the canonical MIME for octet-stream uploads', async () => {
    await run('application/octet-stream', 'song.wav');

    expect(hoisted.upsertRecordingMock).toHaveBeenCalledWith(
      expect.objectContaining({ audioFormat: 'audio/wav' })
    );
  });

  it('normalizes supported MIME aliases to the canonical MIME', async () => {
    await run('audio/x-m4a', 'song.m4a');

    expect(hoisted.upsertRecordingMock).toHaveBeenCalledWith(
      expect.objectContaining({ audioFormat: 'audio/mp4' })
    );
  });

  it('rejects contradictory non-audio MIME even with a supported extension', async () => {
    await expect(run('text/plain')).rejects.toThrow(/not supported/);
    expect(hoisted.upsertRecordingMock).not.toHaveBeenCalled();
  });

  it('rejects unsupported files', async () => {
    await expect(run('text/plain', 'notes.txt')).rejects.toThrow(
      /not supported/
    );
    expect(hoisted.upsertRecordingMock).not.toHaveBeenCalled();
  });
});
