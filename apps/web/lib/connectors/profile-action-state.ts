import 'server-only';
import { and, asc, sql as drizzleSql, eq } from 'drizzle-orm';
import { getExactProfileAccess } from '@/lib/auth/profile-access';
import { db } from '@/lib/db';
import { connectorAccounts } from '@/lib/db/schema/connectors';
import { socialLinks } from '@/lib/db/schema/links';
import { creatorProfiles, userProfileClaims } from '@/lib/db/schema/profiles';
import {
  type ArtistProfileField,
  artistProfileContractSchema,
} from './artist-profile-contract';
import { ARTIST_PROFILE_FIELD_ACCESSORS } from './artist-profile-fields';
import type { ProfileActionKind } from './profile-action';
import { digest } from './profile-writes/contract';
import { getConnectorDefinition } from './registry';
import { PROFILE_WRITE_DESTINATION_KIND } from './suggested-action-kinds';

export class ProfileActionError extends Error {
  constructor(
    readonly code: string,
    readonly status = 409
  ) {
    super(code);
  }
}

/** Current source values and SQL guards are captured together for the approval CAS. */
export async function loadProfileActionState(input: {
  userId: string;
  creatorProfileId: string;
  connectorAccountId: string;
  fields: ArtistProfileField[];
  kind: ProfileActionKind;
}) {
  const access = await getExactProfileAccess(
    db,
    input.userId,
    input.creatorProfileId
  );
  if (!access.ok) throw new ProfileActionError('profile-action-not-owned', 403);

  const [account] = await db
    .select({
      id: connectorAccounts.id,
      provider: connectorAccounts.provider,
      providerAccountId: connectorAccounts.providerAccountId,
      creatorProfileId: connectorAccounts.creatorProfileId,
      scopes: connectorAccounts.scopes,
    })
    .from(connectorAccounts)
    .where(
      and(
        eq(connectorAccounts.id, input.connectorAccountId),
        eq(connectorAccounts.userId, input.userId),
        eq(connectorAccounts.status, 'connected')
      )
    )
    .limit(1);
  if (
    !account ||
    (account.creatorProfileId &&
      account.creatorProfileId !== input.creatorProfileId)
  ) {
    throw new ProfileActionError('profile-action-target-unavailable', 403);
  }
  const parsed = artistProfileContractSchema.safeParse(
    getConnectorDefinition(account.provider).artistProfile
  );
  if (!parsed.success)
    throw new ProfileActionError('profile-action-manifest-not-ready');
  const manifest = parsed.data;
  const operation =
    input.kind === PROFILE_WRITE_DESTINATION_KIND ? 'write' : 'read';
  for (const field of input.fields) {
    const policy = manifest.fields[field];
    const authorization = policy.authorization[operation];
    if (
      policy[operation] !== 'supported' ||
      !['verified', 'public'].includes(authorization.status)
    ) {
      throw new ProfileActionError('profile-action-manifest-not-ready');
    }
    if (
      authorization.status === 'verified' &&
      (authorization.requiredScopes.some(
        scope => !account.scopes.includes(scope)
      ) ||
        (authorization.requiredRole === 'owner' &&
          access.ownerUserId !== input.userId))
    )
      throw new ProfileActionError(
        'profile-action-authorization-required',
        403
      );
  }

  const [profile] = await db
    .select({
      id: creatorProfiles.id,
      bio: creatorProfiles.bio,
      avatarUrl: creatorProfiles.avatarUrl,
      username: creatorProfiles.username,
      usernameNormalized: creatorProfiles.usernameNormalized,
      profileEditVersion: creatorProfiles.profileEditVersion,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, input.creatorProfileId))
    .limit(1);
  if (!profile) throw new ProfileActionError('profile-action-not-owned', 403);
  const links = await db
    .select({
      id: socialLinks.id,
      platform: socialLinks.platform,
      platformType: socialLinks.platformType,
      url: socialLinks.url,
      sortOrder: socialLinks.sortOrder,
      isActive: socialLinks.isActive,
      state: socialLinks.state,
    })
    .from(socialLinks)
    .where(eq(socialLinks.creatorProfileId, profile.id))
    .orderBy(asc(socialLinks.id));
  const sources = {
    profile: {
      bio: profile.bio,
      avatar_url: profile.avatarUrl,
      username: profile.username,
      username_normalized: profile.usernameNormalized,
    },
    socialLinks: links.map(link => ({
      ...link,
      platform_type: link.platformType,
      sort_order: link.sortOrder ?? 0,
      is_active: link.isActive ?? false,
    })),
  };
  const values = Object.fromEntries(
    Object.entries(ARTIST_PROFILE_FIELD_ACCESSORS).map(([key, accessor]) => [
      key,
      accessor(sources),
    ])
  );
  const canonicalRevision = digest({
    version: profile.profileEditVersion,
    values,
  });
  const target = {
    connectorAccountId: account.id,
    provider: account.provider,
    providerAccountId: account.providerAccountId,
  };
  const linkRows = links.map(link => [
    link.id,
    link.platform,
    link.platformType,
    link.url,
    link.sortOrder,
    link.isActive,
    link.state,
  ]);
  // Recheck both the legacy fallback and canonical claims in the same SQL statement.
  const ownership = drizzleSql`(
    (not exists (select 1 from ${userProfileClaims} where ${userProfileClaims.creatorProfileId} = ${profile.id})
      and ${creatorProfiles.userId} = ${input.userId})
    or (exists (select 1 from ${userProfileClaims} where ${userProfileClaims.creatorProfileId} = ${profile.id}
      and ${userProfileClaims.userId} = ${input.userId} and ${userProfileClaims.role} in ('owner', 'manager'))
      and (select count(*) from ${userProfileClaims} where ${userProfileClaims.creatorProfileId} = ${profile.id}
        and ${userProfileClaims.userId} = ${input.userId} and ${userProfileClaims.role} in ('owner', 'manager')) = 1
      and (select count(*) from ${userProfileClaims} where ${userProfileClaims.creatorProfileId} = ${profile.id}
        and ${userProfileClaims.role} = 'owner') <= 1)
  )`;
  const requiresOwner = input.fields.some(field => {
    const authorization = manifest.fields[field].authorization[operation];
    return (
      authorization.status === 'verified' &&
      authorization.requiredRole === 'owner'
    );
  });
  const guard = drizzleSql`
    exists (select 1 from ${creatorProfiles} where ${creatorProfiles.id} = ${profile.id}
      and ${ownership}
      and (${!requiresOwner} or exists (select 1 from ${userProfileClaims}
        where ${userProfileClaims.creatorProfileId} = ${profile.id} and ${userProfileClaims.userId} = ${input.userId}
          and ${userProfileClaims.role} = 'owner')
        or (not exists (select 1 from ${userProfileClaims} where ${userProfileClaims.creatorProfileId} = ${profile.id})
          and ${creatorProfiles.userId} = ${input.userId}))
      and ${creatorProfiles.profileEditVersion} = ${profile.profileEditVersion}
      and ${creatorProfiles.bio} is not distinct from ${profile.bio}
      and ${creatorProfiles.avatarUrl} is not distinct from ${profile.avatarUrl}
      and ${creatorProfiles.username} = ${profile.username}
      and ${creatorProfiles.usernameNormalized} is not distinct from ${profile.usernameNormalized})
    and exists (select 1 from ${connectorAccounts} where ${connectorAccounts.id} = ${account.id}
      and ${connectorAccounts.userId} = ${input.userId} and ${connectorAccounts.status} = 'connected'
      and ${connectorAccounts.provider} = ${account.provider}
      and ${connectorAccounts.providerAccountId} = ${account.providerAccountId}
      and ${connectorAccounts.creatorProfileId} is not distinct from ${account.creatorProfileId}
      and to_jsonb(${connectorAccounts.scopes}) = ${JSON.stringify(account.scopes)}::jsonb)
    and (select coalesce(jsonb_agg(jsonb_build_array(${socialLinks.id}, ${socialLinks.platform},
      ${socialLinks.platformType}, ${socialLinks.url}, ${socialLinks.sortOrder}, ${socialLinks.isActive}, ${socialLinks.state})
      order by ${socialLinks.id}), '[]'::jsonb) from ${socialLinks}
      where ${socialLinks.creatorProfileId} = ${profile.id}) = ${JSON.stringify(linkRows)}::jsonb`;
  return {
    target,
    values,
    canonicalRevision,
    manifestVersion: digest(manifest),
    guard,
  };
}
