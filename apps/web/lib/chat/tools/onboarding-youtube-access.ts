import 'server-only';

import { qualifyRegularlyUploadingChannel } from '@/lib/acquisition/youtube-closed-loop';
import { logger } from '@/lib/utils/logger';
import {
  listRecentPublicVideos,
  parseYouTubeChannelInput,
  resolveYouTubeChannel,
} from '@/lib/youtube/resolve-channel';
import {
  decideOnboardingAccess,
  type OnboardingAccessInput,
} from './onboarding-access-eval';
import { collapseInterviewSignals } from './onboarding-signals';

/** Both model tools and scripted recovery use the same public evidence. */
export async function decideYouTubeOnboardingAccess(
  input: OnboardingAccessInput
) {
  const signal = collapseInterviewSignals(
    input.signals.map(value => ({
      ...value,
      recordedAt: new Date().toISOString(),
    }))
  );
  const effectiveInput = {
    ...input,
    publicProfileUrl: input.publicProfileUrl ?? signal.youtubeChannelUrl,
  };
  const preliminary = decideOnboardingAccess({
    ...effectiveInput,
    youtubeQualified: false,
  });
  if (
    preliminary.kind === 'needs_more_info' ||
    signal.isMusicArtist === false
  ) {
    return preliminary;
  }
  const channelUrl = signal.youtubeChannelUrl ?? input.publicProfileUrl;
  if (!channelUrl || !(input.spotifyArtistId || signal.isMusicArtist)) {
    return preliminary;
  }

  // Require a YouTube URL: the resolver also accepts bare handles, which
  // must not turn an unrelated public profile into a YouTube lookup.
  try {
    const host = new URL(channelUrl).hostname.replace(/^(www|m)\./, '');
    if (host !== 'youtube.com') return preliminary;
    const ref = parseYouTubeChannelInput(channelUrl);
    const channel = ref ? await resolveYouTubeChannel(ref) : null;
    if (!channel) return preliminary;
    const videos = await listRecentPublicVideos(channel.uploadsPlaylistId, 12);
    const cadence = qualifyRegularlyUploadingChannel({ videos });
    return decideOnboardingAccess({
      ...effectiveInput,
      youtubeQualified: cadence.qualified,
    });
  } catch {
    // Missing key, provider failure, or malformed link never opens access.
    logger.warn('[onboarding] YouTube qualification unavailable');
    return preliminary;
  }
}
