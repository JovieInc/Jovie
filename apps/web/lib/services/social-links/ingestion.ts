import { captureError } from '@/lib/error-tracking';
import {
  enqueueBeaconsIngestionJob,
  enqueueLayloIngestionJob,
  enqueueLinktreeIngestionJob,
  enqueueYouTubeIngestionJob,
} from '@/lib/ingestion/jobs';
import {
  isBeaconsUrl,
  validateBeaconsUrl,
} from '@/lib/ingestion/strategies/beacons';
import { isLayloUrl } from '@/lib/ingestion/strategies/laylo';
import { isLinktreeUrl } from '@/lib/ingestion/strategies/linktree';
import { validateYouTubeChannelUrl } from '@/lib/ingestion/strategies/youtube';

interface LinkInput {
  platform: string;
  url: string;
}

/**
 * Schedule ingestion jobs for links that match supported platforms.
 * This is a non-blocking operation - failures are logged but don't affect the response.
 */
export async function scheduleIngestionJobs(
  profileId: string,
  links: LinkInput[]
): Promise<void> {
  const linktreeTargets = links.filter(
    link => link.platform === 'linktree' || isLinktreeUrl(link.url)
  );

  const beaconsTargets = links
    .map(link => {
      const validated = validateBeaconsUrl(link.url);
      if (!validated) return null;
      return link.platform === 'beacons' || isBeaconsUrl(validated)
        ? { ...link, url: validated }
        : null;
    })
    .filter((link): link is NonNullable<typeof link> => Boolean(link));

  const layloTargets = links.filter(
    link => link.platform === 'laylo' || isLayloUrl(link.url)
  );

  const youtubeTargets = links
    .map(link => {
      const validated = validateYouTubeChannelUrl(link.url);
      return validated ? { ...link, url: validated } : null;
    })
    .filter((link): link is NonNullable<typeof link> => Boolean(link));

  const jobs: Promise<unknown>[] = [];

  if (beaconsTargets.length > 0) {
    jobs.push(
      ...beaconsTargets.map(link =>
        enqueueBeaconsIngestionJob({
          creatorProfileId: profileId,
          sourceUrl: link.url,
        }).catch(err => {
          captureError('Failed to enqueue beacons ingestion job', err, {
            profileId,
            url: link.url,
          });
          return null;
        })
      )
    );
  }

  if (linktreeTargets.length > 0) {
    jobs.push(
      ...linktreeTargets.map(link =>
        enqueueLinktreeIngestionJob({
          creatorProfileId: profileId,
          sourceUrl: link.url,
        }).catch(err => {
          captureError('Failed to enqueue linktree ingestion job', err, {
            profileId,
            url: link.url,
          });
          return null;
        })
      )
    );
  }

  if (layloTargets.length > 0) {
    jobs.push(
      ...layloTargets.map(link =>
        enqueueLayloIngestionJob({
          creatorProfileId: profileId,
          sourceUrl: link.url,
        }).catch(err => {
          captureError('Failed to enqueue laylo ingestion job', err, {
            profileId,
            url: link.url,
          });
          return null;
        })
      )
    );
  }

  if (youtubeTargets.length > 0) {
    jobs.push(
      ...youtubeTargets.map(link =>
        enqueueYouTubeIngestionJob({
          creatorProfileId: profileId,
          sourceUrl: link.url,
        }).catch(err => {
          captureError('Failed to enqueue youtube ingestion job', err, {
            profileId,
            url: link.url,
          });
          return null;
        })
      )
    );
  }

  await Promise.all(jobs);
}
