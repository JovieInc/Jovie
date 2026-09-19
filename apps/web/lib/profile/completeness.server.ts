import 'server-only';

import { and, eq, inArray, isNull } from 'drizzle-orm';
import { getAppUrl } from '@/constants/domains';
import { type DbOrTransaction, db } from '@/lib/db';
import { leads } from '@/lib/db/schema/leads';
import { socialLinks } from '@/lib/db/schema/links';
import {
  creatorProfileAttributes,
  creatorProfiles,
} from '@/lib/db/schema/profiles';
import {
  assessProfileCompleteness,
  type ProfileCompletenessJudgment,
  type ProfileCompletenessSnapshot,
} from './completeness-certification';

export type ProfileCompletenessAssessment = ReturnType<
  typeof assessProfileCompleteness
> & {
  snapshot: ProfileCompletenessSnapshot;
  judgment: ProfileCompletenessJudgment | null;
};

/** Read current content at each decision boundary; an eligibility cache can outlive edits. */
export async function loadProfileCompleteness(
  profileIds: readonly string[],
  client: DbOrTransaction = db
) {
  const ids = [...new Set(profileIds)];
  if (!ids.length) return new Map<string, ProfileCompletenessAssessment>();
  const [profiles, links, attributes, sourceLeads] = await Promise.all([
    client
      .select({
        id: creatorProfiles.id,
        username: creatorProfiles.username,
        displayName: creatorProfiles.displayName,
        avatarUrl: creatorProfiles.avatarUrl,
        bio: creatorProfiles.bio,
        userId: creatorProfiles.userId,
        profileEditVersion: creatorProfiles.profileEditVersion,
        updatedAt: creatorProfiles.updatedAt,
        judgment: creatorProfiles.completenessJudgment,
      })
      .from(creatorProfiles)
      .where(inArray(creatorProfiles.id, ids)),
    client
      .select({
        profileId: socialLinks.creatorProfileId,
        platform: socialLinks.platform,
        url: socialLinks.url,
        id: socialLinks.id,
        version: socialLinks.version,
      })
      .from(socialLinks)
      .where(
        and(
          inArray(socialLinks.creatorProfileId, ids),
          eq(socialLinks.isActive, true),
          eq(socialLinks.state, 'active')
        )
      ),
    client
      .select({
        profileId: creatorProfileAttributes.creatorProfileId,
        id: creatorProfileAttributes.id,
        url: creatorProfileAttributes.sourceUrl,
      })
      .from(creatorProfileAttributes)
      .where(inArray(creatorProfileAttributes.creatorProfileId, ids)),
    client
      .select({
        profileId: leads.creatorProfileId,
        id: leads.id,
        url: leads.sourceUrl,
        linktreeUrl: leads.linktreeUrl,
      })
      .from(leads)
      .where(inArray(leads.creatorProfileId, ids)),
  ]);
  return new Map(
    profiles.map(profile => {
      const destinations = links.filter(link => link.profileId === profile.id);
      const provenance: ProfileCompletenessSnapshot['provenance'][number][] = [
        ...attributes
          .filter(row => row.profileId === profile.id && row.url)
          .map(row => ({
            kind: 'public_source' as const,
            referenceId: row.id,
            url: row.url!,
          })),
        ...sourceLeads
          .filter(
            row => row.profileId === profile.id && (row.url || row.linktreeUrl)
          )
          .map(row => ({
            kind: 'public_source' as const,
            referenceId: row.id,
            url: (row.url || row.linktreeUrl)!,
          })),
      ];
      if (profile.userId)
        provenance.push({
          kind: 'creator_profile',
          referenceId: profile.id,
          url: getAppUrl(`/${profile.username}`),
        });
      const snapshot: ProfileCompletenessSnapshot = {
        profileId: profile.id,
        revision: JSON.stringify([
          profile.profileEditVersion,
          profile.updatedAt.toISOString(),
          destinations.map(link => [link.id, link.version]).sort(),
        ]),
        username: profile.username,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        bio: profile.bio,
        destinations,
        provenance,
      };
      return [
        profile.id,
        {
          ...assessProfileCompleteness(snapshot, profile.judgment),
          snapshot,
          judgment: profile.judgment,
        },
      ];
    })
  );
}

export async function requireProfileCompleteness(
  profileId: string | null,
  client: DbOrTransaction = db
): Promise<void> {
  const result = profileId
    ? (await loadProfileCompleteness([profileId], client)).get(profileId)
    : null;
  if (!result?.eligible)
    throw new Error(
      'Profile completeness certification required before outreach'
    );
}

export async function requireLeadCompleteness(leadId: string): Promise<void> {
  const [lead] = await db
    .select({ profileId: leads.creatorProfileId })
    .from(leads)
    .where(eq(leads.id, leadId))
    .limit(1);
  await requireProfileCompleteness(lead?.profileId ?? null);
}

/** Evaluate outside a transaction. The caller must supply the admitted Jev adapter. */
export async function reassessProfileCompleteness(
  profileId: string,
  evaluate: (
    input: ProfileCompletenessAssessment
  ) => Promise<ProfileCompletenessJudgment>
) {
  const before = (await loadProfileCompleteness([profileId])).get(profileId);
  if (!before) return { status: 'profile_missing' as const };
  if (!Object.values(before.checks).every(Boolean))
    return { status: 'incomplete' as const, assessment: before };
  if (before.eligible)
    return { status: 'current' as const, assessment: before };
  const judgment = await evaluate(before);
  // Do not overwrite a newer assessment or persist a judgment about changed content.
  const current = (await loadProfileCompleteness([profileId])).get(profileId);
  if (!current || current.snapshotSha256 !== before.snapshotSha256)
    return { status: 'changed' as const };
  if (current.eligible)
    return { status: 'current' as const, assessment: current };
  const assessed = assessProfileCompleteness(current.snapshot, judgment);
  if (
    assessed.reasons.includes('evaluation_mismatch') ||
    assessed.reasons.includes('evaluation_stale')
  )
    return { status: 'invalid_evaluation' as const };
  if (judgment.transportStatus !== 'evaluated')
    return { status: 'not_evaluated' as const };
  const revision = JSON.parse(current.snapshot.revision) as [number, string];
  const [saved] = await db
    .update(creatorProfiles)
    .set({ completenessJudgment: judgment })
    .where(
      and(
        eq(creatorProfiles.id, profileId),
        eq(creatorProfiles.profileEditVersion, revision[0]),
        eq(creatorProfiles.updatedAt, new Date(revision[1])),
        current.judgment
          ? eq(creatorProfiles.completenessJudgment, current.judgment)
          : isNull(creatorProfiles.completenessJudgment)
      )
    )
    .returning({ id: creatorProfiles.id });
  // Link/provenance edits racing this write are caught by the next consumer hash check.
  return saved
    ? { status: 'evaluated' as const, assessment: assessed }
    : { status: 'changed' as const };
}
