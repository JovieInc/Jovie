import 'server-only';

import { and, eq } from 'drizzle-orm';
import { CONNECTOR_PROVIDERS } from '@/lib/connectors/registry';
import { db } from '@/lib/db';
import { connectorAccounts } from '@/lib/db/schema/connectors';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import {
  readYouTubeCandidateFromSettings,
  resolveYouTubeVerificationState,
  type YouTubeCandidate,
  type YouTubeVerificationState,
} from './youtube-verification';

/**
 * Channel ids the user has proven they own. A `connected` YouTube connector
 * account is only ever written by the OAuth callback after
 * `listOwnedYouTubeChannels` (`mine=true`) returned that channel id for the
 * signed-in user, so its `providerAccountId` is ownership proof.
 *
 * Fails closed: any error yields no verified channels.
 */
export async function getVerifiedOwnedYouTubeChannelIds(
  userId: string
): Promise<readonly string[]> {
  try {
    const rows = await db
      .select({ channelId: connectorAccounts.providerAccountId })
      .from(connectorAccounts)
      .where(
        and(
          eq(connectorAccounts.userId, userId),
          eq(connectorAccounts.provider, CONNECTOR_PROVIDERS.youtube),
          eq(connectorAccounts.status, 'connected')
        )
      );
    return rows.map(row => row.channelId);
  } catch (error) {
    void captureError('YouTube verified-channel lookup failed', error);
    return [];
  }
}

export interface YouTubeVerificationView {
  readonly state: YouTubeVerificationState;
  readonly channel: Pick<YouTubeCandidate, 'title' | 'url'> | null;
}

/** Profile-scoped view for the dashboard; fail closed to `none`. */
export async function getYouTubeVerificationView(input: {
  readonly userId: string;
  readonly profileId: string;
}): Promise<YouTubeVerificationView> {
  try {
    const [profile] = await db
      .select({ settings: creatorProfiles.settings })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.id, input.profileId))
      .limit(1);
    const candidate = readYouTubeCandidateFromSettings(profile?.settings);
    if (!candidate) return { state: 'none', channel: null };
    const verified = await getVerifiedOwnedYouTubeChannelIds(input.userId);
    return {
      state: resolveYouTubeVerificationState(candidate, verified),
      channel: { title: candidate.title, url: candidate.url },
    };
  } catch (error) {
    void captureError('YouTube verification view failed', error);
    return { state: 'none', channel: null };
  }
}
