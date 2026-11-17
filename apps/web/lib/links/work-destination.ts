import type { EntityPopoverData } from '@/components/shell/EntityPopover';
import { BASE_URL } from '@/constants/domains';
import { buildDestinationJovieLink } from './destination-links';

/** Work-asset context the destination rows preview and link back to. */
export interface WorkDestinationAsset {
  readonly id: string;
  readonly title: string;
  readonly artist: string;
  readonly artworkUrl: string | null;
  readonly releaseType: string;
  readonly releaseDate: string | null;
  readonly smartLinkPath: string;
}

/**
 * Props for a Work-surface destination row (DspQuietRow): the release
 * summary for the hover preview card plus the UTM-tagged Jovie link for
 * the action menu. Kept beside the other destination-link helpers so the
 * LibrarySurface page file stays on its size-500 baseline.
 */
export function workDestinationRowProps(
  asset: WorkDestinationAsset,
  destinationKey: string
): {
  entity: EntityPopoverData;
  jovieLinkUrl: string;
} {
  return {
    entity: {
      kind: 'release',
      id: asset.id,
      label: asset.title,
      thumbnail: asset.artworkUrl ?? undefined,
      artist: asset.artist,
      releaseType: asset.releaseType,
      releaseDate: asset.releaseDate ?? undefined,
    },
    jovieLinkUrl: buildDestinationJovieLink({
      baseUrl: BASE_URL,
      linkPath: asset.smartLinkPath,
      destinationKey,
      surface: 'work-inspector',
    }),
  };
}
