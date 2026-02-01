/**
 * CSV export configuration for releases table.
 * Defines column mapping and formatting for CSV export.
 */

import type { ReleaseViewModel } from '@/lib/discography/types';
import type { CSVColumn } from '@/lib/utils/csv';

/**
 * Format milliseconds as mm:ss or hh:mm:ss
 */
function formatDuration(ms: number | null | undefined): string {
  if (!ms) return '';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Format release date as YYYY-MM-DD
 */
function formatDate(dateString: string | undefined): string {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    return date.toISOString().split('T')[0];
  } catch {
    return '';
  }
}

/**
 * CSV column configuration for releases export.
 * Exports all relevant release data including provider URLs.
 */
export const RELEASES_CSV_COLUMNS: CSVColumn<ReleaseViewModel>[] = [
  { header: 'Title', accessor: 'title' },
  { header: 'Type', accessor: 'releaseType' },
  {
    header: 'Release Date',
    accessor: 'releaseDate',
    formatter: value => formatDate(value as string | undefined),
  },
  { header: 'Label', accessor: 'label', formatter: v => (v as string) || '' },
  { header: 'UPC', accessor: 'upc', formatter: v => (v as string) || '' },
  {
    header: 'ISRC',
    accessor: 'primaryIsrc',
    formatter: v => (v as string) || '',
  },
  { header: 'Tracks', accessor: 'totalTracks' },
  {
    header: 'Duration',
    accessor: 'totalDurationMs',
    formatter: value => formatDuration(value as number | null | undefined),
  },
  {
    header: 'Genres',
    accessor: 'genres',
    formatter: value => ((value as string[]) || []).join(', '),
  },
  {
    header: 'Popularity',
    accessor: 'spotifyPopularity',
    formatter: v => {
      if (v == null) return '';
      if (typeof v === 'object') return JSON.stringify(v);
      return String(v);
    },
  },
  {
    header: 'Smart Link',
    accessor: row =>
      typeof window === 'undefined'
        ? row.smartLinkPath
        : `${globalThis.location.origin}${row.smartLinkPath}`,
  },
  {
    header: 'Spotify URL',
    accessor: row => row.providers.find(p => p.key === 'spotify')?.url || '',
  },
  {
    header: 'Apple Music URL',
    accessor: row =>
      row.providers.find(p => p.key === 'apple_music')?.url || '',
  },
  {
    header: 'YouTube URL',
    accessor: row => row.providers.find(p => p.key === 'youtube')?.url || '',
  },
  {
    header: 'SoundCloud URL',
    accessor: row => row.providers.find(p => p.key === 'soundcloud')?.url || '',
  },
  {
    header: 'Deezer URL',
    accessor: row => row.providers.find(p => p.key === 'deezer')?.url || '',
  },
  {
    header: 'Tidal URL',
    accessor: row => row.providers.find(p => p.key === 'tidal')?.url || '',
  },
  {
    header: 'Amazon Music URL',
    accessor: row =>
      row.providers.find(p => p.key === 'amazon_music')?.url || '',
  },
  {
    header: 'Bandcamp URL',
    accessor: row => row.providers.find(p => p.key === 'bandcamp')?.url || '',
  },
];

/**
 * Get releases data for CSV export.
 * Can export all releases or just selected ones.
 *
 * @param releases - All releases
 * @param selectedIds - Optional set of selected release IDs to export
 * @returns Releases to export
 */
export function getReleasesForExport(
  releases: ReleaseViewModel[],
  selectedIds?: Set<string>
): ReleaseViewModel[] {
  if (selectedIds && selectedIds.size > 0) {
    return releases.filter(r => selectedIds.has(r.id));
  }
  return releases;
}
