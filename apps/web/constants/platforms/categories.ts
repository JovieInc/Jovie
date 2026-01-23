/**
 * Platform Categories
 *
 * Category labels and ordering for platform display.
 */

import type { PlatformCategory } from './types';

/**
 * Human-readable labels for platform categories.
 */
export const CATEGORY_LABELS: Readonly<Record<PlatformCategory, string>> = {
  music: 'Music & Streaming',
  social: 'Social Media',
  creator: 'Creator Platforms',
  link_aggregators: 'Link Aggregators',
  payment: 'Payment & Tips',
  messaging: 'Messaging',
  professional: 'Professional',
  other: 'Other',
} as const;

/**
 * Display order for categories in UI.
 */
export const CATEGORY_ORDER: readonly PlatformCategory[] = [
  'music',
  'social',
  'creator',
  'link_aggregators',
  'payment',
  'messaging',
  'professional',
  'other',
] as const;
