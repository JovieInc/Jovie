const longReleaseDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

const shortReleaseDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

const releaseArtistListFormatter = new Intl.ListFormat('en', {
  style: 'long',
  type: 'conjunction',
});

function parseReleaseDate(date: string): Date | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [year, month, day] = date.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }

  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatReleaseArtistLine(
  artistNames: string[] | undefined,
  fallbackArtistName: string | null | undefined
): string | null {
  const normalizedNames = (artistNames ?? [])
    .map(name => name.trim())
    .filter(Boolean);

  if (normalizedNames.length > 0) {
    return releaseArtistListFormatter.format(normalizedNames);
  }

  const fallback = fallbackArtistName?.trim();
  return fallback ? fallback : null;
}

export function formatCompactReleaseArtistLine(
  artistNames: string[] | undefined,
  fallbackArtistName: string | null | undefined,
  maxVisibleArtists = 2
): string | null {
  const normalizedNames = (artistNames ?? [])
    .map(name => name.trim())
    .filter(Boolean);

  if (normalizedNames.length === 0) {
    const fallback = fallbackArtistName?.trim();
    return fallback ? fallback : null;
  }

  if (normalizedNames.length <= maxVisibleArtists) {
    return releaseArtistListFormatter.format(normalizedNames);
  }

  const visibleNames = normalizedNames.slice(0, maxVisibleArtists);
  const remainingCount = normalizedNames.length - maxVisibleArtists;
  return `${visibleNames.join(', ')} +${remainingCount}`;
}

export function formatReleaseDate(date: string | undefined): string {
  if (!date) return 'Release date TBD';
  const parsed = parseReleaseDate(date);
  return parsed ? longReleaseDateFormatter.format(parsed) : 'Invalid date';
}

export function formatReleaseDateShort(date: string | undefined): string {
  if (!date) return 'TBD';
  const parsed = parseReleaseDate(date);
  return parsed ? shortReleaseDateFormatter.format(parsed) : 'Invalid';
}
