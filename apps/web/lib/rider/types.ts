export const RIDER_VISIBILITIES = [
  'private',
  'profile_public',
  'link_only',
] as const;
export type RiderVisibility = (typeof RIDER_VISIBILITIES)[number];

export interface RiderSection {
  title: string;
  items: string[];
}
