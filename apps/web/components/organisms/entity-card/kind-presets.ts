import {
  Bell,
  Bot,
  type LucideIcon,
  Music2,
  Play,
  ShoppingBag,
  Ticket,
} from 'lucide-react';
import type { CSSProperties } from 'react';
import type { EntityAccent, EntityKind, EntityStatusTone } from './types';

interface KindPreset {
  readonly eyebrow: string;
  readonly icon: LucideIcon;
  readonly accent: EntityAccent;
  readonly fallbackVariant: 'release' | 'avatar' | 'generic';
  readonly ctaLabel: string;
}

/** Per-kind defaults. Adapters may override eyebrow/accent/cta as needed. */
export const KIND_PRESETS: Record<EntityKind, KindPreset> = {
  merch: {
    eyebrow: 'Merch',
    icon: ShoppingBag,
    accent: 'green',
    fallbackVariant: 'generic',
    ctaLabel: 'Buy',
  },
  music: {
    eyebrow: 'Music',
    icon: Music2,
    accent: 'purple',
    fallbackVariant: 'release',
    ctaLabel: 'Listen',
  },
  video: {
    eyebrow: 'Video',
    icon: Play,
    accent: 'pink',
    fallbackVariant: 'release',
    ctaLabel: 'Watch',
  },
  show: {
    eyebrow: 'Show',
    icon: Ticket,
    accent: 'blue',
    fallbackVariant: 'generic',
    ctaLabel: 'Tickets',
  },
  ai: {
    eyebrow: 'AI Visibility',
    icon: Bot,
    accent: 'blue',
    fallbackVariant: 'generic',
    ctaLabel: 'View Details',
  },
  alerts: {
    eyebrow: 'Alerts',
    icon: Bell,
    accent: 'purple',
    fallbackVariant: 'generic',
    ctaLabel: 'Get Updates',
  },
};

/** CSS custom-property reference for a Carbon accent. */
export function accentVar(accent: EntityAccent): string {
  return `var(--color-accent-${accent})`;
}

/** Shared EntityCard artwork ambient background. */
export function entityCardArtStyle(accent: EntityAccent): CSSProperties {
  return {
    background: `radial-gradient(120% 120% at 32% 22%, color-mix(in oklab, ${accentVar(accent)} 22%, transparent), transparent 62%), linear-gradient(155deg, var(--color-bg-surface-2), var(--color-bg-surface-1))`,
  };
}

/** Color for a status dot, sourced from design tokens. */
export function statusDotVar(tone: EntityStatusTone | undefined): string {
  switch (tone) {
    case 'live':
      return 'var(--color-accent-green)';
    case 'scheduled':
      return 'var(--color-accent-orange)';
    case 'draft':
      return 'var(--color-text-quaternary-token)';
    default:
      return 'var(--color-text-tertiary-token)';
  }
}
