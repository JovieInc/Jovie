import type { EntityRailActivityItem } from './ActivityFeed';

// A fixed clock in ActivityFeed.test.tsx keeps calendar groups deterministic.
export const ACTIVITY_ITEMS: readonly EntityRailActivityItem[] = [
  ['Tim White', 'edited', 'Midnight Drive', '2026-01-15T01:05:00Z'],
  ['Jovie', 'linked', 'Spotify', '2026-01-15T09:00:00Z'],
  ['Maya Vale', 'approved', 'Tour poster', '2026-01-14T18:30:00Z'],
  ['Jovie', 'published', 'Lost in the Light', '2026-01-13T08:00:00Z'],
].map(([actor, verb, object, at], index) => ({
  id: String(index),
  actor,
  verb,
  object,
  at,
}));
