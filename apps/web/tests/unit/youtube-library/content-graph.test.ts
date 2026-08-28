import { describe, expect, it } from 'vitest';
import { founderDemoCatalogSnapshot } from '@/lib/catalog';
import {
  planYouTubeImportArtifacts,
  reconcileVerifiedCollaboratorCredit,
  resolveYouTubeCollaboratorClaims,
} from '@/lib/youtube-library/collaborators';
import {
  deriveThumbnailExperimentWinner,
  promoteThumbnailWinner,
} from '@/lib/youtube-library/thumbnail-experiments';
import type { YouTubeChannelVideo } from '@/lib/youtube-library/types';

const video: YouTubeChannelVideo = {
  channelId: 'UC-1',
  videoId: 'yt-1',
  title: 'Neon Skyline (feat. Cosmic Gate)',
  description: 'Official video featuring Cosmic Gate',
  publishedAt: new Date('2026-01-01T00:00:00.000Z'),
  durationSeconds: 200,
  url: 'https://youtube.com/watch?v=yt-1',
  privacyStatus: 'public',
  thumbnails: {},
};

describe('YouTube content graph', () => {
  it('appends provider identity and fails low-confidence credits closed', () => {
    const artifacts = planYouTubeImportArtifacts({
      existingVideoIds: new Set(),
      imported: [{ videoPk: 'pk-1', video }],
      catalog: founderDemoCatalogSnapshot,
    });
    expect(artifacts.sourceEvents[0]).toMatchObject({
      providerVideoId: 'yt-1',
      kind: 'imported',
    });
    const unknown = resolveYouTubeCollaboratorClaims({
      title: 'Song (feat. Nobody Famous)',
      catalog: founderDemoCatalogSnapshot,
    })[0];
    expect(unknown?.status).toBe('pending_review');
    expect(
      reconcileVerifiedCollaboratorCredit({
        claim: unknown!,
        recordingId: 'rec-1',
        releaseId: 'rel-1',
      })
    ).toBeNull();
  });

  it('promotes a thumbnail winner only after locked metrics', () => {
    const window = {
      start: new Date('2026-08-01T00:00:00.000Z'),
      end: new Date('2026-08-08T00:00:00.000Z'),
      locked: true,
    };
    const candidates = [
      {
        versionId: 'a',
        imageUrl: 'https://img/a.jpg',
        impressions: 1000,
        ctr: 0.04,
        views: 40,
      },
      {
        versionId: 'b',
        imageUrl: 'https://img/b.jpg',
        impressions: 1100,
        ctr: 0.07,
        views: 77,
      },
    ];
    expect(
      deriveThumbnailExperimentWinner({
        experimentId: 'exp-1',
        videoPk: 'pk-1',
        window: { ...window, locked: false },
        candidates,
        now: new Date('2026-08-04T00:00:00.000Z'),
      }).winnerVersionId
    ).toBeNull();
    const locked = deriveThumbnailExperimentWinner({
      experimentId: 'exp-1',
      videoPk: 'pk-1',
      window,
      candidates,
      now: new Date('2026-08-09T00:00:00.000Z'),
    });
    expect(locked.winnerVersionId).toBe('b');
    expect(
      promoteThumbnailWinner({
        experiment: locked,
        currentVersionId: 'a',
        promotedBy: 'user-1',
        promotedAt: new Date('2026-08-09T01:00:00.000Z'),
      }).winnerVersionId
    ).toBe('b');
  });
});
