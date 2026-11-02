import 'server-only';
import {
  advanceOnboardingProfileDraft,
  type OnboardingProfileDraft,
} from './profile-draft';

/** Reuse the bounded, redirect/DNS-checked importer. No network-derived ownership. */
export async function prepareOnboardingProfileDraft(
  previous: OnboardingProfileDraft,
  message: { readonly id: string; readonly text: string },
  confirmedArtistId: string | null
): Promise<OnboardingProfileDraft> {
  const draft = advanceOnboardingProfileDraft(previous, message);
  if (confirmedArtistId && !draft.roles.includes('artist')) {
    draft.roles = [...draft.roles, 'artist' as const].sort();
    draft.activeRole = draft.roles.length === 1 ? 'artist' : null;
    draft.awaiting = draft.activeRole ? 'outcome' : 'priority';
  }
  if (
    confirmedArtistId &&
    draft.activeRole === 'artist' &&
    !draft.selectedSource
  ) {
    const url = `https://open.spotify.com/artist/${encodeURIComponent(confirmedArtistId)}`;
    draft.sourceCandidates = [
      ...new Set([...draft.sourceCandidates, url]),
    ].slice(-8);
    draft.selectedSource = {
      url,
      status: 'unavailable',
      title: null,
      description: null,
      fetchedAt: null,
    };
    draft.awaiting = draft.outcome ? 'review' : 'outcome';
  }
  const source = draft.selectedSource;
  // Music enrichment stays in the existing artist adapter.
  if (!source || draft.activeRole === 'artist' || !draft.activeRole)
    return draft;
  const retry = /^(retry|try again)[.!]?$/i.test(message.text.trim());
  if (source.status !== 'pending' && !retry) return draft;
  source.title = null;
  source.description = null;
  try {
    const [{ safeFetchPublicHtml }, { extractBioCandidate }] =
      await Promise.all([
        import('@/lib/ai/tools/safe-fetch-public-html'),
        import('@/lib/ai/tools/extract-bio-candidate'),
      ]);
    const result = await safeFetchPublicHtml(source.url);
    if (result.ok) {
      source.title = result.sourceTitle ?? null;
      source.description =
        extractBioCandidate(result.html)?.slice(0, 600) ?? null;
      source.status =
        source.title || source.description ? 'available' : 'unavailable';
    } else source.status = 'unavailable';
  } catch {
    source.status = 'unavailable';
  }
  source.fetchedAt =
    source.status === 'available' ? new Date().toISOString() : null;
  return draft;
}
