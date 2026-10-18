import { captureError } from '@/lib/error-tracking';
import {
  enqueueBeaconsIngestionJob,
  enqueueLayloIngestionJob,
  enqueueTikTokIngestionJob,
  enqueueTwitterIngestionJob,
  enqueueYouTubeIngestionJob,
} from '@/lib/ingestion/jobs';
import {
  isBeaconsUrl,
  validateBeaconsUrl,
} from '@/lib/ingestion/strategies/beacons';
import { isLayloUrl } from '@/lib/ingestion/strategies/laylo';
import {
  isTikTokUrl,
  validateTikTokUrl,
} from '@/lib/ingestion/strategies/tiktok';
import {
  isTwitterUrl,
  validateTwitterUrl,
} from '@/lib/ingestion/strategies/twitter';
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

  const tiktokTargets = links
    .map(link => {
      const validated = validateTikTokUrl(link.url);
      if (!validated) return null;
      return link.platform === 'tiktok' || isTikTokUrl(validated)
        ? { ...link, url: validated }
        : null;
    })
    .filter((link): link is NonNullable<typeof link> => Boolean(link));

  const twitterTargets = links
    .map(link => {
      const validated = validateTwitterUrl(link.url);
      if (!validated) return null;
      return link.platform === 'twitter' || isTwitterUrl(validated)
        ? { ...link, url: validated }
        : null;
    })
    .filter((link): link is NonNullable<typeof link> => Boolean(link));

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

  if (tiktokTargets.length > 0) {
    jobs.push(
      ...tiktokTargets.map(link =>
        enqueueTikTokIngestionJob({
          creatorProfileId: profileId,
          sourceUrl: link.url,
        }).catch(err => {
          captureError('Failed to enqueue tiktok ingestion job', err, {
            profileId,
            url: link.url,
          });
          return null;
        })
      )
    );
  }

  if (twitterTargets.length > 0) {
    jobs.push(
      ...twitterTargets.map(link =>
        enqueueTwitterIngestionJob({
          creatorProfileId: profileId,
          sourceUrl: link.url,
        }).catch(err => {
          captureError('Failed to enqueue twitter ingestion job', err, {
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
