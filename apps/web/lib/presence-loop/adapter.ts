import type {
  ProfilesWorkspaceData,
  ProfileWorkspaceRow,
} from '@/components/features/presence/types';
import {
  buildPresenceRows,
  type CanonicalIdentity,
  computeLoopMetrics,
  type FixProposal,
  type LoopMetrics,
  type PresenceMode,
  type PresenceRow,
  type ProfileObservation,
  proposeFix,
} from './health';

/** Platforms every identity is expected to have; company/personal differ later. */
export const EXPECTED_PLATFORMS: Record<PresenceMode, readonly string[]> = {
  personal: ['instagram', 'tiktok', 'x', 'youtube'],
  company: ['instagram', 'tiktok', 'x', 'youtube'],
};

function normalizePlatform(platform: string): string {
  return platform === 'twitter' ? 'x' : platform;
}

/**
 * Map real workspace rows to observations. Only what is genuinely observed is
 * set; everything else stays null so nothing is guessed (no bio/handle/photo
 * comparison and no link-back until a fetcher records them).
 */
export function rowsToObservations(
  rows: readonly ProfileWorkspaceRow[]
): ProfileObservation[] {
  const out: ProfileObservation[] = [];
  for (const row of rows) {
    if (row.rowType !== 'surface' || row.kind === 'jovie') continue;
    if (row.id.startsWith('preview:')) continue;
    const owned =
      row.qualificationStatus === 'qualified' ||
      row.qualificationStatus === 'conflicting';
    out.push({
      platform: normalizePlatform(row.platform),
      url: row.url,
      qualified: owned,
      reachable: row.monitoringState === 'unavailable' ? false : null,
      identityConflict: row.qualificationStatus === 'conflicting',
      handle: null,
      bio: null,
      photoHash: null,
      linksBackToJovie: null,
      jovieLinksOut: row.linksOut ?? null,
      lastCheckedAt: row.lastObservedAt ? new Date(row.lastObservedAt) : null,
    });
  }
  return out;
}

export interface PresenceHealth {
  readonly rows: PresenceRow[];
  readonly metrics: LoopMetrics;
}

export function buildPresenceHealth(
  data: Pick<ProfilesWorkspaceData, 'rows'>,
  options: {
    readonly mode: PresenceMode;
    readonly canonical: CanonicalIdentity;
    readonly now?: Date;
  }
): PresenceHealth {
  const rows = buildPresenceRows({
    observations: rowsToObservations(data.rows),
    expectedPlatforms: EXPECTED_PLATFORMS[options.mode],
    canonical: options.canonical,
    now: options.now ?? new Date(),
  });
  return { rows, metrics: computeLoopMetrics(rows) };
}

const SEVERITY_RANK = { high: 0, medium: 1, low: 2 } as const;

/**
 * One approvable fix for a row: its most severe issue. Null when the row is
 * healthy or not an owned surface, so the action never appears as a dead end.
 */
export function fixForRow(
  row: ProfileWorkspaceRow,
  mode: PresenceMode,
  now: Date = new Date()
): FixProposal | null {
  const [obs] = rowsToObservations([row]);
  if (!obs?.qualified) return null;
  const [health] = buildPresenceRows({
    observations: [obs],
    expectedPlatforms: [],
    canonical: { handle: '', bio: '', photoHash: '' },
    now,
  });
  const issue = [...(health?.issues ?? [])].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
  )[0];
  return issue ? proposeFix(issue, mode) : null;
}

/** Chat deep link that opens the drafted task for the user to review and send. */
export function fixChatHref(fix: FixProposal): string {
  return `/app/chat?q=${encodeURIComponent(fix.agentTask)}`;
}
