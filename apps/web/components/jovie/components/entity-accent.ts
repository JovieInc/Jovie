import type { EntityKind } from '@/lib/chat/tokens';

/** Per-kind System B accent aliases for entity chips and inline mention spans. */
export const ENTITY_KIND_ACCENT_VAR: Record<EntityKind, string> = {
  release: '--system-b-entity-chip-release-accent',
  artist: '--system-b-entity-chip-artist-accent',
  track: '--system-b-entity-chip-track-accent',
  event: '--system-b-entity-chip-event-accent',
};

export function entityAccentCssVar(kind: EntityKind): string {
  return `var(${ENTITY_KIND_ACCENT_VAR[kind]})`;
}
