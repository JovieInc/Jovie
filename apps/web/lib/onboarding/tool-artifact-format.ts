/** Shared format helpers for onboarding tool artifacts (size extract). */

export function formatCompactCount(
  count: number | null | undefined
): string | null {
  if (typeof count !== 'number' || !Number.isFinite(count)) return null;
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toLocaleString('en-US');
}

export function formatExactCount(
  count: number | null | undefined
): string | null {
  if (typeof count !== 'number' || !Number.isFinite(count)) return null;
  return count.toLocaleString('en-US');
}

export function formatGenreLabel(genre: string): string {
  return genre
    .trim()
    .replaceAll(/\s+/g, ' ')
    .split(' ')
    .map(word =>
      word
        .split('-')
        .map(part =>
          part
            ? `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`
            : part
        )
        .join('-')
    )
    .join(' ');
}

export function hostnameFor(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function getSafeSpotifyArtistUrl(
  url: string | null | undefined
): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return null;
    if (parsed.hostname !== 'open.spotify.com') return null;
    if (!parsed.pathname.startsWith('/artist/')) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}
