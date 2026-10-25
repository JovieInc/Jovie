import {
  type ChannelMatch,
  pickProvenChannel,
  scoreChannelAgainstCatalog,
} from '@/lib/youtube/catalog-match';
import { readYouTubeCandidateFromSettings } from './youtube-verification';

/**
 * Silent YouTube linking. When a public channel provably carries the artist's
 * catalog (name equality + distinct catalog titles), link it with no UI, no
 * badge and no question. This is association only: ownership is still proven
 * solely by OAuth, so nothing here may feed admission, approval or the Jovie
 * verification badge.
 */

export const SILENT_LINK_RECHECK_MS = 24 * 60 * 60 * 1000;
/** Fewer catalog titles than this cannot prove anything; wait for the catalog. */
export const MIN_CATALOG_TITLES = 2;

export type SilentLinkResult =
  | { readonly status: 'linked'; readonly channelId: string }
  | {
      readonly status: 'skipped';
      readonly reason:
        | 'already_linked'
        | 'recently_checked'
        | 'catalog_too_small'
        | 'no_profile'
        | 'provider_unavailable';
    }
  | { readonly status: 'no_match' }
  | { readonly status: 'needs_review'; readonly channelIds: readonly string[] };

export interface SilentLinkDeps {
  now(): Date;
  loadProfile(profileId: string): Promise<{
    readonly displayName: string | null;
    readonly usernameNormalized: string;
    readonly settings: unknown;
  } | null>;
  /** Any youtube link row, including `rejected` (the owner removed it). */
  hasYouTubeLinkRow(profileId: string): Promise<boolean>;
  loadCatalogTitles(profileId: string): Promise<readonly string[]>;
  searchChannels(
    query: string
  ): Promise<readonly { channelId: string; title: string }[]>;
  loadEvidence(
    channelId: string,
    fallbackTitle: string
  ): Promise<{
    channelId: string;
    title: string;
    videoTitles: readonly string[];
    handle: string | null;
  } | null>;
  insertLink(input: {
    profileId: string;
    usernameNormalized: string;
    url: string;
    title: string;
    match: ChannelMatch;
    /** `active` shows on the profile; `suggested` waits for the owner. */
    state: 'active' | 'suggested';
  }): Promise<void>;
  markChecked(profileId: string, at: Date): Promise<void>;
}

function lastCheckedAt(settings: unknown): number {
  const onboarding =
    settings && typeof settings === 'object'
      ? (settings as { onboarding?: unknown }).onboarding
      : null;
  const raw =
    onboarding && typeof onboarding === 'object'
      ? (onboarding as { youtubeDiscoveryAt?: unknown }).youtubeDiscoveryAt
      : null;
  const parsed = typeof raw === 'string' ? Date.parse(raw) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function runSilentYouTubeLink(
  deps: SilentLinkDeps,
  profileId: string
): Promise<SilentLinkResult> {
  const profile = await deps.loadProfile(profileId);
  const artistName = profile?.displayName?.trim();
  if (!profile || !artistName)
    return { status: 'skipped', reason: 'no_profile' };
  if (await deps.hasYouTubeLinkRow(profileId)) {
    return { status: 'skipped', reason: 'already_linked' };
  }
  const now = deps.now();
  if (
    now.getTime() - lastCheckedAt(profile.settings) <
    SILENT_LINK_RECHECK_MS
  ) {
    return { status: 'skipped', reason: 'recently_checked' };
  }
  const catalogTitles = await deps.loadCatalogTitles(profileId);
  if (catalogTitles.length < MIN_CATALOG_TITLES) {
    return { status: 'skipped', reason: 'catalog_too_small' };
  }

  const typed = readYouTubeCandidateFromSettings(profile.settings);
  let candidates: { channelId: string; title: string }[];
  try {
    const hits = await deps.searchChannels(artistName);
    candidates = [...hits];
    if (typed && !candidates.some(c => c.channelId === typed.channelId)) {
      candidates.unshift({ channelId: typed.channelId, title: typed.title });
    }
  } catch (error) {
    if (
      (error as { code?: string } | null)?.code ===
      'youtube_data_api_unavailable'
    ) {
      return { status: 'skipped', reason: 'provider_unavailable' };
    }
    throw error;
  }

  const matches: ChannelMatch[] = [];
  const evidenceById = new Map<
    string,
    { title: string; handle: string | null }
  >();
  for (const candidate of candidates) {
    const evidence = await deps.loadEvidence(
      candidate.channelId,
      candidate.title
    );
    if (!evidence) continue;
    evidenceById.set(evidence.channelId, {
      title: evidence.title,
      handle: evidence.handle,
    });
    matches.push(
      scoreChannelAgainstCatalog({
        artistName,
        catalogTitles,
        channel: evidence,
      })
    );
  }
  await deps.markChecked(profileId, now);

  const chosen = pickProvenChannel(matches, typed?.channelId);
  const urlFor = (channelId: string) => {
    const info = evidenceById.get(channelId);
    return info?.handle
      ? `https://www.youtube.com/@${info.handle}`
      : `https://www.youtube.com/channel/${channelId}`;
  };
  if (!chosen) {
    // Several channels carry the catalog and none is clearly the artist's:
    // never guess publicly; queue them as owner-review suggestions.
    const ambiguous = matches.filter(match => match.proven).slice(0, 3);
    if (ambiguous.length === 0) return { status: 'no_match' };
    for (const match of ambiguous) {
      await deps.insertLink({
        profileId,
        usernameNormalized: profile.usernameNormalized,
        url: urlFor(match.channelId),
        title: evidenceById.get(match.channelId)?.title ?? artistName,
        match,
        state: 'suggested',
      });
    }
    return {
      status: 'needs_review',
      channelIds: ambiguous.map(match => match.channelId),
    };
  }
  await deps.insertLink({
    profileId,
    usernameNormalized: profile.usernameNormalized,
    url: urlFor(chosen.channelId),
    title: evidenceById.get(chosen.channelId)?.title ?? artistName,
    match: chosen,
    state: 'active',
  });
  return { status: 'linked', channelId: chosen.channelId };
}
