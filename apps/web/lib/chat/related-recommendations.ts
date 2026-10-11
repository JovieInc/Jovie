import { relatedSubjectsLabel } from '@/lib/creator/vocabulary';

/**
 * Source context for related-subject recommendations (JOV-7635).
 *
 * Jovie serves founders, authors, experts, and creators — not only music
 * artists. Music-similarity language ("related artists", playlist pitching)
 * is only correct when the creator's identity and work actually come from
 * music sources. This module keeps that framing source-aware.
 */
export interface RelatedRecommendationSource {
  readonly genres: readonly string[];
  readonly hasMusicLinks: boolean;
  readonly spotifyPopularity: number | null;
}

/**
 * The recommendation source counts as music when the profile carries any
 * music-derived signal: synced genres, linked DSPs, or a Spotify popularity
 * score.
 */
export function isMusicRecommendationSource(
  context: RelatedRecommendationSource
): boolean {
  return (
    context.hasMusicLinks ||
    context.genres.length > 0 ||
    context.spotifyPopularity !== null
  );
}

export interface RelatedSuggestionsFraming {
  readonly isMusicSource: boolean;
  /** Lowercase noun phrase for the recommended subjects. */
  readonly subjectTerm: string;
  /** Title-cased label for UI surfaces. */
  readonly subjectLabel: string;
  /** Tool description shown to the model. */
  readonly description: string;
  /** Guidance the tool result hands back to the model. */
  readonly instructions: string;
  /** Short status-line summary persisted with the tool event. */
  readonly summary: string;
}

export function buildRelatedSuggestionsFraming(
  context: RelatedRecommendationSource
): RelatedSuggestionsFraming {
  const isMusicSource = isMusicRecommendationSource(context);
  const subjectLabel = relatedSubjectsLabel(isMusicSource);
  const subjectTerm = subjectLabel.toLowerCase();

  if (isMusicSource) {
    return {
      isMusicSource,
      subjectTerm,
      subjectLabel,
      description:
        "Suggest related artists for playlist pitching, ad targeting, and collaboration based on the artist's genre, style, and popularity level. Returns advice on which artists to target.",
      instructions:
        'Based on the artist context above, suggest related artists. Consider: genre alignment, similar popularity tier (aim slightly higher for pitching), audience overlap potential, and the specific purpose. For ad targeting, include both larger and smaller artists in the same niche. For playlist pitching, focus on artists who are on playlists the user would want to be on.',
      summary: 'Related artists context ready.',
    };
  }

  return {
    isMusicSource,
    subjectTerm,
    subjectLabel,
    description:
      "Suggest related creators for collaborations, lookalike ad audiences, and outreach based on the creator's identity and work. Returns advice on which creators to target.",
    instructions:
      'Based on the creator context above, suggest related creators. Consider: audience overlap, comparable positioning (aim slightly higher for outreach), shared subject matter, and the specific purpose. For ad targeting, include both larger and smaller creators in the same niche.',
    summary: 'Related creators context ready.',
  };
}
