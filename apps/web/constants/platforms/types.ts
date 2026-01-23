/**
 * Platform Types
 *
 * Type definitions for the platform registry.
 */

/**
 * Platform category types.
 */
export type PlatformCategory =
  | 'music'
  | 'social'
  | 'creator'
  | 'link_aggregators'
  | 'payment'
  | 'messaging'
  | 'professional'
  | 'other';

/**
 * Platform metadata structure.
 */
export interface PlatformMetadata {
  readonly id: string;
  readonly name: string;
  readonly category: PlatformCategory;
  readonly icon: string;
  readonly color: string;
}
