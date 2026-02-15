interface ArtistBioWriterInput {
  readonly artistName: string;
  readonly existingBio: string | null;
  readonly genres: string[];
  readonly spotifyFollowers: number | null;
  readonly spotifyPopularity: number | null;
  readonly spotifyUrl: string | null;
  readonly appleMusicUrl: string | null;
  readonly profileViews: number;
  readonly releaseCount: number;
  readonly notableReleases: string[];
}

interface ArtistBioWriterOutput {
  readonly draft: string;
  readonly facts: string[];
  readonly voiceDirectives: string[];
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function buildMarketSignal(input: ArtistBioWriterInput): string {
  if (input.spotifyFollowers != null && input.spotifyFollowers >= 100_000) {
    return `The momentum is clear: ${formatNumber(input.spotifyFollowers)} Spotify followers and a catalog built for global scale.`;
  }

  if (input.spotifyFollowers != null && input.spotifyFollowers >= 10_000) {
    return `With ${formatNumber(input.spotifyFollowers)} Spotify followers, ${input.artistName} has moved beyond discovery and into consistent demand.`;
  }

  if (input.spotifyFollowers != null && input.spotifyFollowers > 0) {
    return `${input.artistName} is actively building audience traction, now reaching ${formatNumber(input.spotifyFollowers)} Spotify followers.`;
  }

  return `${input.artistName} is in a focused growth chapter, building a fanbase release by release across streaming platforms.`;
}

function buildCatalogSignal(input: ArtistBioWriterInput): string {
  if (input.releaseCount <= 0) {
    return 'Their catalog is in an early stage, with new material expected to define the next chapter.';
  }

  const releases = input.notableReleases.slice(0, 2);
  if (releases.length === 0) {
    return `Their catalog currently spans ${input.releaseCount} releases, each sharpening a distinct artistic identity.`;
  }

  if (releases.length === 1) {
    return `Recent work includes ${releases[0]}, highlighting a catalog that now spans ${input.releaseCount} releases.`;
  }

  return `Recent releases such as ${releases[0]} and ${releases[1]} show a catalog that now spans ${input.releaseCount} releases.`;
}

function sanitizeText(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function buildArtistBioDraft(
  input: ArtistBioWriterInput
): ArtistBioWriterOutput {
  const genreLine =
    input.genres.length > 0
      ? `${input.artistName} works across ${input.genres.slice(0, 3).join(', ')}.`
      : `${input.artistName} blends contemporary pop discipline with artist-first storytelling.`;

  const marketSignal = buildMarketSignal(input);
  const catalogSignal = buildCatalogSignal(input);
  const existingBio = sanitizeText(input.existingBio);
  const profileSignal =
    input.profileViews > 0
      ? `The artist profile has already drawn ${formatNumber(input.profileViews)} views, reinforcing sustained fan curiosity.`
      : 'The profile presence is in an early phase, with runway for sharper positioning and conversion.';

  const ellipsis = existingBio && existingBio.length > 180 ? '…' : '';
  const bioExcerpt = existingBio ? existingBio.slice(0, 180) + ellipsis : null;

  const draft = [
    genreLine,
    marketSignal,
    catalogSignal,
    profileSignal,
    bioExcerpt
      ? `Their current positioning emphasizes: "${bioExcerpt}".`
      : null,
  ]
    .filter(Boolean)
    .join(' ');

  const followersText =
    input.spotifyFollowers != null
      ? formatNumber(input.spotifyFollowers)
      : 'not available';
  const popularityText =
    input.spotifyPopularity != null
      ? `${input.spotifyPopularity} / 100`
      : 'not available';
  const facts = [
    `Spotify followers: ${followersText}`,
    `Spotify popularity: ${popularityText}`,
    `Catalog size: ${input.releaseCount} release${input.releaseCount === 1 ? '' : 's'}`,
    `Spotify profile linked: ${input.spotifyUrl ? 'yes' : 'no'}`,
    `Apple Music profile linked: ${input.appleMusicUrl ? 'yes' : 'no'}`,
  ];

  const voiceDirectives = [
    'Write in third person with editorial credibility, not marketing hype.',
    'Anchor claims to verifiable data points and avoid fabricated achievements.',
    'Balance artistry and market signal in 2-3 tight paragraphs.',
    'Use vivid but precise language in the style of premium music journalism.',
  ];

  return { draft, facts, voiceDirectives };
}

export type { ArtistBioWriterInput, ArtistBioWriterOutput };
