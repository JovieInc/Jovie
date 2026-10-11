import 'server-only';

import { and, desc, eq } from 'drizzle-orm';
import { getProfileUrl } from '@/constants/domains';
import { db } from '@/lib/db';
import {
  type AudienceSourceLink,
  audienceSourceGroups,
  audienceSourceLinks,
} from '@/lib/db/schema/analytics';
import { socialLinks } from '@/lib/db/schema/links';
import { captureError } from '@/lib/error-tracking';
import { loadReleaseMatrixForProfile } from '@/lib/releases/release-matrix-loader';
import type { ReleaseProfileContext } from '@/lib/releases/release-types';
import {
  buildProfileLinkRow,
  buildReleaseLinkRow,
  buildSocialLinkRow,
  buildSourceLinkRow,
  type LinkRow,
} from './links-model';

export interface LinksWorkspaceData {
  readonly rows: LinkRow[];
  readonly loadFailed: boolean;
}

/**
 * Composes the Links workspace: canonical smart links derived from the
 * profile's entity graph plus stored trackable short links. Each loader fails
 * soft — a degraded source drops that family rather than the whole page.
 */
export async function loadLinksWorkspaceData(input: {
  readonly profileId: string;
  readonly profileHandle: string;
  readonly profileTitle: string;
  readonly releaseProfileContext: ReleaseProfileContext;
  readonly route: string;
}): Promise<LinksWorkspaceData> {
  const { profileId, profileHandle, profileTitle, route } = input;
  const profileUrl = getProfileUrl(profileHandle);
  let loadFailed = false;
  let socialLoadFailed = false;

  const sourceLinkRowsPromise = db
    .select({
      link: audienceSourceLinks,
      groupName: audienceSourceGroups.name,
    })
    .from(audienceSourceLinks)
    .leftJoin(
      audienceSourceGroups,
      eq(audienceSourceLinks.sourceGroupId, audienceSourceGroups.id)
    )
    .where(eq(audienceSourceLinks.creatorProfileId, profileId))
    .orderBy(desc(audienceSourceLinks.createdAt))
    .limit(200)
    .catch(error => {
      loadFailed = true;
      void captureError('Links workspace source links load failed', error, {
        route,
        profileId,
      });
      return [] as Array<{
        link: AudienceSourceLink;
        groupName: string | null;
      }>;
    });

  const socialLinkRowsPromise = db
    .select()
    .from(socialLinks)
    .where(
      and(
        eq(socialLinks.creatorProfileId, profileId),
        eq(socialLinks.state, 'active'),
        eq(socialLinks.isActive, true)
      )
    )
    .orderBy(desc(socialLinks.createdAt))
    .limit(200)
    .catch(error => {
      loadFailed = true;
      socialLoadFailed = true;
      void captureError('Links workspace social links load failed', error, {
        route,
        profileId,
      });
      return [] as Array<typeof socialLinks.$inferSelect>;
    });

  const releasesPromise = loadReleaseMatrixForProfile(
    input.releaseProfileContext
  ).catch(error => {
    loadFailed = true;
    void captureError('Links workspace releases load failed', error, {
      route,
      profileId,
    });
    return [] as Awaited<ReturnType<typeof loadReleaseMatrixForProfile>>;
  });

  const [sourceLinkRows, socialLinkRows, releases] = await Promise.all([
    sourceLinkRowsPromise,
    socialLinkRowsPromise,
    releasesPromise,
  ]);

  const profileClickTotal = socialLoadFailed
    ? null
    : socialLinkRows.reduce((total, link) => total + (link.clicks ?? 0), 0);

  const rows: LinkRow[] = [
    buildProfileLinkRow({
      handle: profileHandle,
      title: profileTitle,
      clicks: profileClickTotal,
    }),
    ...releases.map(buildReleaseLinkRow),
    ...sourceLinkRows.map(({ link, groupName }) =>
      buildSourceLinkRow(link, groupName)
    ),
    ...socialLinkRows.map(link => buildSocialLinkRow({ link, profileUrl })),
  ];

  return { rows, loadFailed };
}
