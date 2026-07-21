import type { MouseEvent } from 'react';

/** The entity kinds a card can represent across profile + chat + dashboard. */
export type EntityKind = 'merch' | 'music' | 'video' | 'show' | 'ai' | 'alerts';

/** Carbon accent palette name (maps to `--color-accent-<name>`). */
export type EntityAccent =
  | 'gray'
  | 'blue'
  | 'purple'
  | 'pink'
  | 'red'
  | 'orange'
  | 'green'
  | 'teal';

/** Studio treatments: Feature Hero / Compact / Detailed. */
export type EntityTreatment = 'big' | 'compact' | 'detailed';

/** Surface the card sits on: app shell (chat/dashboard) or frosted profile pearl. */
export type EntitySurface = 'app' | 'pearl';

export type EntityStatusTone = 'live' | 'scheduled' | 'draft' | 'neutral';

export interface EntityCardStatus {
  readonly label: string;
  readonly tone?: EntityStatusTone;
}

export interface EntityCardPrice {
  /** Display price, sale-aware (e.g. "$34.00"). */
  readonly display: string;
  /** Original price, shown struck-through when on sale. */
  readonly original?: string;
  /** Creator take-home, shown as a quiet secondary line. */
  readonly profit?: string;
}

export interface EntityCardDatePill {
  readonly month: string;
  readonly day: string;
}

export interface EntityCardCta {
  readonly label: string;
  readonly href?: string | null;
  readonly external?: boolean;
  readonly onClick?: (event: MouseEvent<HTMLElement>) => void;
  readonly disabled?: boolean;
}

/**
 * Normalized view-model every surface builds via an adapter. The card is purely
 * presentational over this shape — no fetching, no business logic.
 */
export interface EntityCardModel {
  readonly id: string;
  /** Database release id when the card represents catalog music. */
  readonly releaseId?: string;
  readonly kind: EntityKind;
  /** Whole-card link target. Falls back to `cta.href` for hit area. */
  readonly href?: string | null;
  readonly imageUrl?: string | null;
  readonly imageAlt: string;
  /** Overrides the per-kind default accent. */
  readonly accent?: EntityAccent;
  /** Small kind label above the title (e.g. "Merch", "New Single"). */
  readonly eyebrow?: string;
  readonly title: string;
  /** Secondary meta line (product type, release type · year, venue · city). */
  readonly meta?: string | null;
  /** Tertiary meta line (doors time, timezone). */
  readonly secondaryMeta?: string | null;
  readonly status?: EntityCardStatus | null;
  readonly price?: EntityCardPrice | null;
  readonly datePill?: EntityCardDatePill | null;
  readonly cta?: EntityCardCta | null;
  readonly secondaryCta?: EntityCardCta | null;
  /**
   * When true, the card is not a whole-card link and CTAs render as real
   * controls (for analytics, calendar fallback, sold-out/cancelled states).
   */
  readonly interactive?: boolean;
}
