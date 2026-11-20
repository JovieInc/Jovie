import { agentDraftPreviewDigest } from './claim-handoff';
import { trustedImageUrl } from './draft-materialize.server';
import { AGENT_CLAIM_RESERVATION_STALE_MS } from './draft-reservation.server';
import type { AgentDraftRow } from './draft-store';

export interface AgentClaimPreview {
  readonly artistName: string;
  readonly provider: string;
  readonly sourceUrl: string;
  readonly imageUrl: string | null;
  readonly bio: string | null;
  readonly release: {
    readonly title: string | null;
    readonly artistName: string | null;
    readonly releaseDate: string | null;
    readonly artworkUrl: string | null;
    readonly links: Readonly<Record<string, string>>;
  } | null;
  readonly expiresAt: string;
  /** Bound into the claim form; the claim refuses a changed draft. */
  readonly digest: string;
}

export type AgentClaimView =
  | { readonly state: 'invalid' }
  | { readonly state: 'expired' }
  | {
      readonly state: 'claimed';
      readonly ownedByViewer: boolean;
      readonly handle: string | null;
    }
  | { readonly state: 'ready'; readonly preview: AgentClaimPreview };

export function toAgentClaimPreview(row: AgentDraftRow): AgentClaimPreview {
  const { launch, ...artist } = row.preview;
  const release = launch?.result.release;
  return {
    artistName: artist.display_name,
    provider: artist.provider,
    sourceUrl: artist.source_url,
    imageUrl: trustedImageUrl(artist.image_url),
    bio: artist.bio,
    release: release
      ? {
          title: release.title,
          artistName: release.artist_name,
          releaseDate: release.release_date,
          artworkUrl: trustedImageUrl(release.artwork_url),
          links: launch.result.smart_link.links,
        }
      : null,
    expiresAt: row.expiresAt.toISOString(),
    digest: agentDraftPreviewDigest(row.preview),
  };
}

export function isStaleAgentReservation(
  row: AgentDraftRow,
  now = Date.now()
): boolean {
  return Boolean(
    row.claimedAt &&
      now - row.claimedAt.getTime() > AGENT_CLAIM_RESERVATION_STALE_MS &&
      row.expiresAt.getTime() > now
  );
}

export function buildAgentClaimAttribution(row: AgentDraftRow, now: Date) {
  const { acquisition } = row;
  return {
    schema: 'jovie-agent-acquisition/v1',
    draft_id: row.id,
    artist_id: row.artistId,
    agent_source: acquisition.agent_source ?? null,
    client: acquisition.client ?? null,
    installation_id: acquisition.installation_id ?? null,
    session_or_run_id: acquisition.session_or_run_id ?? null,
    intent: acquisition.intent ?? null,
    claimed_at: now.toISOString(),
  };
}
