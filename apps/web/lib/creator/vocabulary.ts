import { APP_ROUTES } from '@/constants/routes';
import type { MerchDesignLane } from '@/lib/merch/types';
import { CREATOR_TYPES } from '@/types';
import type { CreatorType } from '@/types/db';

/**
 * One broad identity type: every profile is a 'creator'. The remaining
 * creator_type values act as optional professions on that identity rather
 * than separate kinds of profile, so UI must never assume a musician.
 */
export const BASE_CREATOR_TYPE = 'creator' as const satisfies CreatorType;

export type CreatorProfession = Exclude<CreatorType, typeof BASE_CREATOR_TYPE>;

export const CREATOR_PROFESSIONS: readonly CreatorProfession[] =
  CREATOR_TYPES.filter(
    (type): type is CreatorProfession => type !== BASE_CREATOR_TYPE
  );

export function isCreatorProfession(value: string): value is CreatorProfession {
  return (CREATOR_PROFESSIONS as readonly string[]).includes(value);
}

/**
 * Display names for the existing creator_type values.
 * The database enum stays artist | podcaster | influencer | creator.
 */
export const CREATOR_PROFESSION_LABELS = {
  artist: 'Artist',
  podcaster: 'Podcaster',
  influencer: 'Influencer',
  creator: 'Creator',
} as const satisfies Record<CreatorType, string>;

export function creatorProfessionLabel(type: CreatorType): string {
  return CREATOR_PROFESSION_LABELS[type];
}

/** Canonical Work surface. A music release is one view of this route. */
export const WORK_ROUTE = APP_ROUTES.LIBRARY;

/**
 * Music events stay on the tour-dates workspace.
 * Renaming that door to Events is a product decision, not a label swap.
 */
export const MUSIC_EVENTS_ROUTE = APP_ROUTES.TOUR_DATES;

/**
 * Display labels for merch_design_lane. Enum values and print artwork stay.
 */
export const MERCH_LANE_LABELS = {
  band_tour_uniform: 'Signature uniform',
  fashion_graphic_item: 'Graphic item',
  artist_world_artifact: 'Identity artifact',
} as const satisfies Record<MerchDesignLane, string>;

export function merchLaneLabel(lane: MerchDesignLane): string {
  return MERCH_LANE_LABELS[lane];
}

/** Spotify's own section title. Keep this when matching their UI. */
export const SPOTIFY_RELATED_SECTION_TITLE = 'Fans Also Like';

/** Jovie label for the same idea outside Spotify's UI. */
export const RELATED_CREATORS_LABEL = 'Related creators';

/**
 * Music-sourced variant. Only correct when the recommendation source is
 * music (genres, music links, or streaming stats) — everything else stays
 * "Related creators".
 */
export const RELATED_ARTISTS_LABEL = 'Related artists';

/** Pick the recommendation label that matches the source of the work. */
export function relatedSubjectsLabel(isMusicSource: boolean): string {
  return isMusicSource ? RELATED_ARTISTS_LABEL : RELATED_CREATORS_LABEL;
}
