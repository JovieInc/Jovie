import type {
  ProfilesWorkspaceFilter,
  ProfileWorkspaceRow,
} from '@/app/app/(shell)/profiles/data';

export type ConnectionStatusTone = 'success' | 'warning' | 'error' | 'neutral';

export interface ConnectionStatus {
  readonly label: string;
  readonly tone: ConnectionStatusTone;
  readonly needsAttention: boolean;
  readonly nextAction: string;
  readonly sortPriority: number;
}

export interface ConnectionsWorkspaceSummary {
  readonly connectionCount: number;
  readonly needsAttentionCount: number;
  readonly bestRank: number | null;
  readonly monitoringLabel: 'Active' | 'Paused' | 'Limited' | 'Unavailable';
}

export type ConnectionPrimaryAction =
  | 'connect'
  | 'reconnect'
  | 'open'
  | 'review'
  | 'upgrade';

const PLATFORM_PRIORITY: Readonly<Record<string, number>> = {
  jovie: 0,
  spotify: 1,
  apple_music: 2,
  youtube_music: 3,
  youtube: 4,
  instagram: 5,
  tiktok: 6,
  soundcloud: 7,
  beatport: 8,
  gmail: 20,
  google_calendar: 21,
};

export function filterProfileWorkspaceRows(
  rows: readonly ProfileWorkspaceRow[],
  filter: ProfilesWorkspaceFilter
): ProfileWorkspaceRow[] {
  if (filter === 'all') return [...rows];
  if (filter === 'source') return rows.filter(row => row.kind === 'authority');
  return rows.filter(row => row.kind === filter);
}

export function getConnectionStatus(
  row: ProfileWorkspaceRow
): ConnectionStatus {
  if (row.rowType === 'connector') {
    if (row.status === 'connected' || row.status === 'syncing') {
      return {
        label: row.status === 'syncing' ? 'Syncing' : 'Active',
        tone: 'success',
        needsAttention: false,
        sortPriority: 2,
        nextAction:
          row.status === 'syncing'
            ? 'Let the current sync finish.'
            : 'No action needed.',
      };
    }
    if (row.status === 'needs_reauth') {
      return {
        label: 'Reconnect Required',
        tone: 'warning',
        needsAttention: true,
        sortPriority: 0,
        nextAction: 'Reconnect this account to resume syncing.',
      };
    }
    if (row.status === 'error') {
      return {
        label: 'Needs Review',
        tone: 'error',
        needsAttention: true,
        sortPriority: 0,
        nextAction: 'Review the connector error and reconnect the account.',
      };
    }
    return {
      label: 'Not Connected',
      tone: 'neutral',
      needsAttention: true,
      sortPriority: 0,
      nextAction: 'Connect this account to enable syncing.',
    };
  }

  if (row.qualificationStatus === 'conflicting') {
    return {
      label: 'Needs Review',
      tone: 'error',
      needsAttention: true,
      sortPriority: 0,
      nextAction:
        'Resolve the identity conflict before monitoring this result.',
    };
  }
  if (row.qualificationStatus === 'suggested') {
    return {
      label: 'Needs Qualification',
      tone: 'warning',
      needsAttention: true,
      sortPriority: 0,
      nextAction: 'Confirm whether this profile belongs to the artist.',
    };
  }
  if (row.monitoringState === 'locked') {
    return {
      label: 'Limit Reached',
      tone: 'warning',
      needsAttention: true,
      sortPriority: 1,
      nextAction: 'Upgrade the monitoring limit to track this page.',
    };
  }
  if (row.monitoringState === 'unavailable') {
    return {
      label: 'Unavailable',
      tone: 'neutral',
      needsAttention: true,
      sortPriority: 0,
      nextAction: 'Review the source URL before monitoring this page.',
    };
  }
  if (row.monitoringState === 'paused') {
    return {
      label: 'Paused',
      tone: 'neutral',
      needsAttention: false,
      sortPriority: 4,
      nextAction: 'Review monitoring settings before resuming this page.',
    };
  }
  if (row.rank === null) {
    return {
      label: row.lastObservedAt ? 'Not Found' : 'Not Measured',
      tone: 'neutral',
      needsAttention: false,
      sortPriority: 3,
      nextAction: row.lastObservedAt
        ? 'Review the page if it should appear in search.'
        : 'No action needed until the first monitoring run completes.',
    };
  }
  return {
    label: 'Active',
    tone: 'success',
    needsAttention: false,
    sortPriority: 2,
    nextAction: 'No action needed.',
  };
}

export function getConnectionPrimaryAction(
  row: ProfileWorkspaceRow
): ConnectionPrimaryAction {
  if (row.rowType === 'connector') {
    if (row.status === 'needs_reauth' || row.status === 'error') {
      return 'reconnect';
    }
    if (row.status === 'not_connected' || row.status === 'disabled') {
      return 'connect';
    }
    return 'open';
  }

  if (row.monitoringState === 'locked') return 'upgrade';
  if (
    row.monitoringState === 'unavailable' ||
    row.monitoringState === 'paused' ||
    row.qualificationStatus === 'conflicting' ||
    row.qualificationStatus === 'suggested'
  ) {
    return 'review';
  }
  return 'open';
}

function statusPriority(row: ProfileWorkspaceRow): number {
  return getConnectionStatus(row).sortPriority;
}

export function sortProfileWorkspaceRows(
  rows: readonly ProfileWorkspaceRow[]
): ProfileWorkspaceRow[] {
  return [...rows].sort((left, right) => {
    const priorityDifference = statusPriority(left) - statusPriority(right);
    if (priorityDifference !== 0) return priorityDifference;

    const platformDifference =
      (PLATFORM_PRIORITY[left.platform] ?? 10) -
      (PLATFORM_PRIORITY[right.platform] ?? 10);
    if (platformDifference !== 0) return platformDifference;

    const labelDifference = left.label.localeCompare(right.label);
    if (labelDifference !== 0) return labelDifference;
    return left.url.localeCompare(right.url);
  });
}

export function summarizeProfileWorkspaceRows(
  rows: readonly ProfileWorkspaceRow[],
  providerAvailable = true
): ConnectionsWorkspaceSummary {
  const surfaceRows = rows.filter(row => row.rowType === 'surface');
  const activeCount = surfaceRows.filter(
    row => row.monitoringState === 'active'
  ).length;
  const pausedCount = surfaceRows.filter(
    row => row.monitoringState === 'paused'
  ).length;
  const limitedCount = surfaceRows.filter(
    row => row.monitoringState === 'locked'
  ).length;
  const measuredRanks = surfaceRows
    .map(row => row.rank)
    .filter((rank): rank is number => rank !== null);

  return {
    connectionCount: rows.length,
    needsAttentionCount: rows.filter(
      row => getConnectionStatus(row).needsAttention
    ).length,
    bestRank: measuredRanks.length > 0 ? Math.min(...measuredRanks) : null,
    monitoringLabel: !providerAvailable
      ? 'Unavailable'
      : activeCount > 0
        ? 'Active'
        : pausedCount > 0
          ? 'Paused'
          : limitedCount > 0
            ? 'Limited'
            : 'Unavailable',
  };
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
