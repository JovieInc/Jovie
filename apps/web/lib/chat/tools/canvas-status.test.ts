import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReleaseContext } from '../types';

const mocks = vi.hoisted(() => ({
  resolveChatRelease: vi.fn(),
  updateOwnedReleaseMetadata: vi.fn(),
}));

vi.mock('../catalog-query', () => ({
  resolveChatRelease: mocks.resolveChatRelease,
}));
vi.mock('../release-writes', () => ({
  updateOwnedReleaseMetadata: mocks.updateOwnedReleaseMetadata,
}));

const { createCheckCanvasStatusTool, createMarkCanvasUploadedTool } =
  await import('./canvas-status');

type Execute = (input: Record<string, unknown>) => Promise<{
  success: boolean;
  error?: string;
  unavailable?: boolean;
  summary?: Record<string, unknown>;
  releases?: Array<Record<string, unknown>>;
  release?: Record<string, unknown>;
}>;

function release(overrides: Partial<ReleaseContext> = {}): ReleaseContext {
  return {
    id: 'rel-1',
    title: 'Glass Weather',
    releaseType: 'single',
    releaseDate: '2099-03-01T00:00:00.000Z',
    artworkUrl: 'https://cdn.test/art.jpg',
    spotifyPopularity: 10,
    totalTracks: 1,
    canvasStatus: 'not_set',
    metadata: {},
    ...overrides,
  };
}

function checkStatus(...args: Parameters<typeof createCheckCanvasStatusTool>) {
  return createCheckCanvasStatusTool(...args).execute as unknown as Execute;
}

function markUploaded(
  ...args: Parameters<typeof createMarkCanvasUploadedTool>
) {
  return createMarkCanvasUploadedTool(...args).execute as unknown as Execute;
}

describe('checkCanvasStatus', () => {
  it('needs a profile', async () => {
    const result = await checkStatus(null, [release()])({});
    expect(result.success).toBe(false);
  });

  it('reports an unavailable catalog as a retry, not as zero releases', async () => {
    const result = await checkStatus('profile-1', [], {
      status: 'unavailable',
      total: null,
    })({});
    expect(result.unavailable).toBe(true);
    expect(result.summary).not.toHaveProperty('total');
  });

  it('reports an empty catalog as zero releases', async () => {
    const result = await checkStatus('profile-1', [], {
      status: 'ok',
      total: 0,
    })({});
    expect(result.summary).toMatchObject({ total: 0 });
  });

  it('lists only releases missing a canvas by default, and all with includeAll', async () => {
    const releases = [
      release(),
      release({
        id: 'rel-2',
        title: 'Has Canvas',
        canvasStatus: 'uploaded',
        metadata: { canvasStatus: 'uploaded' },
      }),
    ];
    const missing = await checkStatus('profile-1', releases)({});
    expect(missing.summary).toEqual({
      total: 2,
      withCanvas: 1,
      withoutCanvas: 1,
    });
    expect(missing.releases?.map(item => item.title)).toEqual([
      'Glass Weather',
    ]);

    const all = await checkStatus('profile-1', releases)({ includeAll: true });
    expect(all.releases?.map(item => item.canvasStatus)).toEqual([
      'not_set',
      'uploaded',
    ]);
  });
});

describe('markCanvasUploaded', () => {
  beforeEach(() => {
    mocks.resolveChatRelease.mockReset();
    mocks.updateOwnedReleaseMetadata.mockReset();
  });

  it('needs a profile', async () => {
    const result = await markUploaded(null, [release()])({
      releaseTitle: 'Glass Weather',
    });
    expect(result.success).toBe(false);
    expect(mocks.updateOwnedReleaseMetadata).not.toHaveBeenCalled();
  });

  it('names the available releases when the title is unknown', async () => {
    mocks.resolveChatRelease.mockResolvedValue(null);
    const result = await markUploaded('profile-1', [release()])({
      releaseTitle: 'Nope',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Glass Weather');
  });

  it('writes the uploaded status onto the owned release', async () => {
    mocks.resolveChatRelease.mockResolvedValue(
      release({ metadata: { mood: 'blue' } })
    );
    mocks.updateOwnedReleaseMetadata.mockResolvedValue({ id: 'rel-1' });
    const result = await markUploaded('profile-1', [release()])({
      releaseTitle: 'Glass Weather',
    });
    expect(result.success).toBe(true);
    expect(result.release).toEqual({
      title: 'Glass Weather',
      previousStatus: 'not_set',
      newStatus: 'uploaded',
    });
    expect(mocks.updateOwnedReleaseMetadata).toHaveBeenCalledWith({
      releaseId: 'rel-1',
      creatorProfileId: 'profile-1',
      metadata: expect.objectContaining({
        mood: 'blue',
        canvasStatus: 'uploaded',
      }),
    });
  });

  it('fails when the release is not the artist’s', async () => {
    mocks.resolveChatRelease.mockResolvedValue(release());
    mocks.updateOwnedReleaseMetadata.mockResolvedValue(null);
    const result = await markUploaded('profile-1', [release()])({
      releaseTitle: 'Glass Weather',
    });
    expect(result).toEqual({
      success: false,
      error: 'Release not found or unauthorized',
    });
  });
});
