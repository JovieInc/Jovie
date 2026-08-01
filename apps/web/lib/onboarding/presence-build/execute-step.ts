import 'server-only';

import { and, count, eq } from 'drizzle-orm';
import { getProfileUrl } from '@/constants/domains';
import { db } from '@/lib/db';
import { discogReleases, discogReleaseTracks } from '@/lib/db/schema/content';
import { dspArtistMatches } from '@/lib/db/schema/dsp-enrichment';
import { socialLinks } from '@/lib/db/schema/links';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import type { PresenceBuildStepId } from './constants';
import type { PresenceBuildArtifact, PresenceBuildFact } from './types';

/** Resolve one step from durable profile data only — never fabricates claims. */
export async function executePresenceBuildStep(
  stepId: PresenceBuildStepId,
  profileId: string
): Promise<PresenceBuildArtifact> {
  switch (stepId) {
    case 'research_artist':
      return researchArtist(profileId);
    case 'assemble_profile':
      return assembleProfile(profileId);
    case 'generate_smart_link':
      return generateSmartLink(profileId);
    case 'draft_welcome_post':
      return draftWelcomePost(profileId);
    default: {
      const _exhaustive: never = stepId;
      throw new Error(`Unknown presence-build step: ${_exhaustive}`);
    }
  }
}

type ProfileCore = {
  id: string;
  username: string | null;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  spotifyId: string | null;
  spotifyUrl: string | null;
};

async function loadProfileCore(profileId: string): Promise<ProfileCore | null> {
  const [profile] = await db
    .select({
      id: creatorProfiles.id,
      username: creatorProfiles.username,
      displayName: creatorProfiles.displayName,
      bio: creatorProfiles.bio,
      avatarUrl: creatorProfiles.avatarUrl,
      spotifyId: creatorProfiles.spotifyId,
      spotifyUrl: creatorProfiles.spotifyUrl,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, profileId))
    .limit(1);
  return profile ?? null;
}

async function countActiveLinks(profileId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(socialLinks)
    .where(
      and(
        eq(socialLinks.creatorProfileId, profileId),
        eq(socialLinks.state, 'active')
      )
    );
  return row?.value ?? 0;
}

async function countTracks(profileId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(discogReleaseTracks)
    .innerJoin(
      discogReleases,
      eq(discogReleases.id, discogReleaseTracks.releaseId)
    )
    .where(eq(discogReleases.creatorProfileId, profileId));
  return row?.value ?? 0;
}

async function researchArtist(
  profileId: string
): Promise<PresenceBuildArtifact> {
  const profile = await loadProfileCore(profileId);
  if (!profile) {
    return empty(
      'Artist research',
      'No profile row found yet — connect Spotify to seed research.'
    );
  }

  const [dspRows, linkRows] = await Promise.all([
    db
      .select({
        providerId: dspArtistMatches.providerId,
        status: dspArtistMatches.status,
      })
      .from(dspArtistMatches)
      .where(eq(dspArtistMatches.creatorProfileId, profileId))
      .limit(20),
    db
      .select({ platform: socialLinks.platform })
      .from(socialLinks)
      .where(
        and(
          eq(socialLinks.creatorProfileId, profileId),
          eq(socialLinks.state, 'active')
        )
      )
      .limit(20),
  ]);

  const facts: PresenceBuildFact[] = [];
  if (profile.displayName?.trim()) {
    facts.push({ label: 'Name', value: profile.displayName.trim() });
  }
  if (profile.spotifyId || profile.spotifyUrl) {
    facts.push({
      label: 'Spotify',
      value: profile.spotifyUrl ?? `artist/${profile.spotifyId}`,
    });
  }
  const confirmedDsp = dspRows.filter(
    row => row.status === 'confirmed' || row.status === 'auto_confirmed'
  );
  if (confirmedDsp.length > 0) {
    facts.push({
      label: 'Connected DSPs',
      value: confirmedDsp
        .map(row => row.providerId)
        .filter(Boolean)
        .join(', '),
    });
  }
  if (linkRows.length > 0) {
    facts.push({
      label: 'Public socials',
      value: linkRows.map(row => row.platform).join(', '),
    });
  }
  if (facts.length === 0) {
    return empty(
      'Artist research',
      'No Spotify identity or public socials found yet.'
    );
  }
  return {
    title: 'Artist research',
    summary: `Found ${facts.length} verified signal${facts.length === 1 ? '' : 's'} from your connected sources.`,
    facts,
  };
}

async function assembleProfile(
  profileId: string
): Promise<PresenceBuildArtifact> {
  const profile = await loadProfileCore(profileId);
  if (!profile) {
    return empty('Profile assembly', 'Profile is not ready to assemble yet.');
  }

  const [releaseRow] = await db
    .select({ value: count() })
    .from(discogReleases)
    .where(eq(discogReleases.creatorProfileId, profileId));
  const [trackCount, linkCount] = await Promise.all([
    countTracks(profileId),
    countActiveLinks(profileId),
  ]);
  const releaseCount = releaseRow?.value ?? 0;

  const facts: PresenceBuildFact[] = [];
  const sections: string[] = [];
  if (profile.displayName?.trim() || profile.username) {
    sections.push('Identity');
    facts.push({ label: 'Handle', value: `@${profile.username}` });
    if (profile.displayName?.trim()) {
      facts.push({ label: 'Display name', value: profile.displayName.trim() });
    }
  }
  if (profile.avatarUrl) {
    sections.push('Photo');
    facts.push({ label: 'Photo', value: 'On file' });
  }
  if (profile.bio?.trim()) {
    sections.push('Bio');
    const bio = profile.bio.trim();
    facts.push({
      label: 'Bio',
      value: bio.length > 120 ? `${bio.slice(0, 117)}…` : bio,
    });
  }
  if (linkCount > 0) {
    sections.push('Links');
    facts.push({ label: 'Active links', value: String(linkCount) });
  }
  if (releaseCount > 0 || trackCount > 0) {
    sections.push('Catalog');
    if (trackCount > 0)
      facts.push({ label: 'Tracks', value: String(trackCount) });
    if (releaseCount > 0) {
      facts.push({ label: 'Releases', value: String(releaseCount) });
    }
  }
  if (sections.length === 0) {
    return empty('Profile assembly', 'No profile sections have real data yet.');
  }
  return {
    title: 'Profile assembly',
    summary: `Assembled ${sections.length} section${sections.length === 1 ? '' : 's'}: ${sections.join(', ')}.`,
    facts,
  };
}

async function generateSmartLink(
  profileId: string
): Promise<PresenceBuildArtifact> {
  const profile = await loadProfileCore(profileId);
  if (!profile?.username) {
    return empty(
      'Smart link',
      'Need a claimed handle before a smart link can be generated.'
    );
  }
  const href = getProfileUrl(profile.username);
  return {
    title: 'Smart link',
    summary: `Your public page is live at ${href.replace(/^https?:\/\//, '')}.`,
    facts: [
      { label: 'Handle', value: `@${profile.username}` },
      { label: 'URL', value: href },
    ],
    href,
  };
}

async function draftWelcomePost(
  profileId: string
): Promise<PresenceBuildArtifact> {
  const profile = await loadProfileCore(profileId);
  if (!profile) {
    return empty(
      'Welcome post',
      'Profile not found — cannot draft without identity.'
    );
  }
  const name = profile.displayName?.trim() || profile.username;
  if (!name) {
    return empty(
      'Welcome post',
      'Need a display name or handle before drafting.'
    );
  }

  const [trackCount, linkCount] = await Promise.all([
    countTracks(profileId),
    countActiveLinks(profileId),
  ]);
  const profileUrl = profile.username ? getProfileUrl(profile.username) : null;

  const draftText = [
    `Hey — I'm ${name}.`,
    trackCount > 0
      ? `I just put my catalog in one place (${trackCount} track${trackCount === 1 ? '' : 's'} on file).`
      : 'I just set up my artist page so everything lives in one place.',
    linkCount > 0 ? `Links are connected (${linkCount} active).` : null,
    profileUrl ? `Find me here: ${profileUrl}` : null,
  ]
    .filter((line): line is string => Boolean(line))
    .join(' ');

  return {
    title: 'Welcome post draft',
    summary: 'Draft ready for review — only uses data already on your profile.',
    facts: [
      { label: 'Based on', value: name },
      ...(trackCount > 0
        ? [{ label: 'Tracks referenced', value: String(trackCount) }]
        : []),
      ...(linkCount > 0
        ? [{ label: 'Links referenced', value: String(linkCount) }]
        : []),
    ],
    draftText,
    href: profileUrl ?? undefined,
  };
}

function empty(title: string, summary: string): PresenceBuildArtifact {
  return { title, summary, facts: [], empty: true };
}
