import type { StatusGlyphState } from '@jovie/ui';
import type { DotBadgeVariant } from '@/components/atoms/DotBadge';
import type { DspMatchStatus } from '@/lib/dsp-enrichment/types';
import type { AudienceIntentLevel } from '@/types';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type DashboardStatusBadgeSemanticStyle = {
  readonly label: string;
} & DotBadgeVariant;

/**
 * Inner label gap for ConfidenceBadge's optional level text.
 * Geometry for the pill itself stays on DotBadge.
 */
export const CONFIDENCE_BADGE_LABEL_GAP_CLASS = 'ml-1';

export const CONFIDENCE_BADGE_STYLES: Record<
  ConfidenceLevel,
  DashboardStatusBadgeSemanticStyle
> = {
  high: {
    label: 'High',
    className: 'border-success/20 bg-surface-1 text-success',
    dotClassName: 'bg-success',
  },
  medium: {
    label: 'Medium',
    className: 'border-warning/20 bg-surface-1 text-warning',
    dotClassName: 'bg-warning',
  },
  low: {
    label: 'Low',
    className: 'border-error/20 bg-surface-1 text-error',
    dotClassName: 'bg-error',
  },
};

export const MATCH_STATUS_BADGE_STYLES: Record<
  DspMatchStatus,
  DashboardStatusBadgeSemanticStyle
> = {
  suggested: {
    label: 'Suggested',
    className: 'border-info/20 bg-surface-1 text-info',
    dotClassName: 'bg-info',
  },
  confirmed: {
    label: 'Confirmed',
    className: 'border-success/20 bg-surface-1 text-success',
    dotClassName: 'bg-success',
  },
  auto_confirmed: {
    label: 'Auto-confirmed',
    className: 'border-success/20 bg-surface-1 text-success',
    dotClassName: 'bg-success',
  },
  rejected: {
    label: 'Rejected',
    className: 'border-subtle bg-surface-1 text-tertiary-token',
    dotClassName: 'bg-tertiary-token',
  },
};

/**
 * DSP match statuses mapped onto the canonical `StatusGlyph` (Pen jAcP1, D5).
 * `MatchStatusBadge` was deleted; render
 * `<StatusGlyph state={MATCH_STATUS_GLYPH_STATE[status]}
 *   label={MATCH_STATUS_BADGE_STYLES[status].label} />`.
 */
export const MATCH_STATUS_GLYPH_STATE: Record<
  DspMatchStatus,
  StatusGlyphState
> = {
  suggested: 'in_review',
  confirmed: 'success',
  auto_confirmed: 'success',
  rejected: 'canceled',
};

export const AUDIENCE_INTENT_BADGE_STYLES: Record<
  AudienceIntentLevel,
  DashboardStatusBadgeSemanticStyle
> = {
  high: {
    label: 'High',
    className: 'border-default bg-surface-1 text-secondary-token',
    dotClassName: 'bg-secondary-token',
  },
  medium: {
    label: 'Medium',
    className: 'border-subtle bg-surface-0 text-tertiary-token',
    dotClassName: 'bg-tertiary-token',
  },
  low: {
    label: 'Low',
    className: 'border-subtle bg-transparent text-tertiary-token',
    dotClassName: 'bg-tertiary-token/70',
  },
};
