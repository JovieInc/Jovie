/** File evidence has no connector_accounts row, OAuth scope, or token. */
export const DISTRIBUTOR_IDS = [
  'awal',
  'cdbaby',
  'distrokid',
  'routenote',
  'symphonic',
  'tunecore',
  'unitedmasters',
] as const;
export type DistributorId = (typeof DISTRIBUTOR_IDS)[number];
