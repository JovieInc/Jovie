import type {
  ProfilesWorkspaceFilter,
  ProfileWorkspaceRow,
} from '@/app/app/(shell)/profiles/data';

export function filterProfileWorkspaceRows(
  rows: readonly ProfileWorkspaceRow[],
  filter: ProfilesWorkspaceFilter
): ProfileWorkspaceRow[] {
  if (filter === 'all') return [...rows];
  if (filter === 'source') {
    return rows.filter(
      row => row.kind === 'authority' || row.kind === 'website'
    );
  }
  return rows.filter(row => row.kind === filter);
}

export function formatProfileRankChange(
  rank: number | null,
  previousRank: number | null
): string {
  if (rank === null || previousRank === null) return '—';
  const change = previousRank - rank;
  if (change === 0) return '—';
  return change > 0 ? `+${change}` : String(change);
}
