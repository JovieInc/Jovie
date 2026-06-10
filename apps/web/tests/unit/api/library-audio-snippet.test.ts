import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  requireAuthMock: vi.fn(),
  getSessionContextMock: vi.fn(),
  resolvePrimaryRecordingForReleaseMock: vi.fn(),
  updateWhereMock: vi.fn(),
  updateSetMock: vi.fn(),
  updateMock: vi.fn(),
  revalidateTagMock: vi.fn(),
  captureErrorMock: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidateTag: hoisted.revalidateTagMock,
}));

vi.mock('@/lib/auth/require-auth', () => ({
  requireAuth: hoisted.requireAuthMock,
}));

vi.mock('@/lib/auth/session', () => ({
  getSessionContext: hoisted.getSessionContextMock,
}));

vi.mock('@/lib/audio/resolve-release-recording', () => ({
  resolvePrimaryRecordingForRelease:
    hoisted.resolvePrimaryRecordingForReleaseMock,
  getSnippetFromRecording: (recording: { metadata: Record<string, unknown> }) =>
    recording.metadata.audioSnippet ?? null,
}));

vi.mock('@/lib/cache/tags', () => ({
  createSmartLinkContentTag: (profileId: string) =>
    `smart-link-content:${profileId}`,
}));

vi.mock('@/lib/db', () => ({
  db: {
    update: hoisted.updateMock,
  },
}));

vi.mock('@/lib/db/schema/content', () => ({
  discogRecordings: {
    id: 'recording.id',
    creatorProfileId: 'recording.creatorProfileId',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  eq: vi.fn(),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureErrorMock,
}));

describe('library audio snippet API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.updateMock.mockReturnValue({ set: hoisted.updateSetMock });
    hoisted.updateSetMock.mockReturnValue({ where: hoisted.updateWhereMock });
    hoisted.requireAuthMock.mockResolvedValue({
      userId: 'clerk_user_123',
      error: null,
    });
    hoisted.getSessionContextMock.mockResolvedValue({
      profile: { id: 'profile_123' },
    });
  });

  it('returns the stored snippet for an owned release', async () => {
    hoisted.resolvePrimaryRecordingForReleaseMock.mockResolvedValue({
      recordingId: 'recording_123',
      previewUrl: 'https://cdn.example.com/preview.mp3',
      audioUrl: 'https://cdn.example.com/preview.mp3',
      durationMs: 180_000,
      metadata: {
        audioSnippet: { startMs: 10_000, endMs: 40_000 },
      },
    });

    const { GET } = await import('@/app/api/library/audio/snippet/route');
    const response = await GET(
      new NextRequest(
        'http://localhost/api/library/audio/snippet?releaseId=00000000-0000-4000-8000-000000000001'
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.snippet).toEqual({ startMs: 10_000, endMs: 40_000 });
    expect(body.previewUrl).toBe('https://cdn.example.com/preview.mp3');
  });

  it('persists a normalized snippet trim window', async () => {
    hoisted.resolvePrimaryRecordingForReleaseMock.mockResolvedValue({
      recordingId: 'recording_123',
      previewUrl: 'https://cdn.example.com/preview.mp3',
      audioUrl: 'https://cdn.example.com/preview.mp3',
      durationMs: 180_000,
      metadata: {},
    });
    hoisted.updateSetMock.mockReturnValue({ where: hoisted.updateWhereMock });
    hoisted.updateWhereMock.mockResolvedValue({ rowCount: 1 });

    const { POST } = await import('@/app/api/library/audio/snippet/route');
    const response = await POST(
      new NextRequest('http://localhost/api/library/audio/snippet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          releaseId: '00000000-0000-4000-8000-000000000001',
          startMs: 12_000,
          endMs: 42_000,
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.snippet).toEqual(
      expect.objectContaining({ startMs: 12_000, endMs: 42_000 })
    );
    expect(hoisted.updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          audioSnippet: expect.objectContaining({
            startMs: 12_000,
            endMs: 42_000,
          }),
        }),
      })
    );
  });
});
