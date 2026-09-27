'use client';

import { StatusGlyph } from '@jovie/ui';
import type { DspMatchStatus } from '@/lib/dsp-enrichment/types';
import {
  MATCH_STATUS_BADGE_STYLES,
  MATCH_STATUS_GLYPH_STATE,
} from './dashboard-status-badge-semantic-contract';

export interface MatchStatusGlyphProps {
  readonly status: DspMatchStatus;
  readonly size?: 'sm' | 'md';
  readonly className?: string;
}

/**
 * MatchStatusGlyph — DSP artist-match status on the canonical `StatusGlyph`
 * (Pen jAcP1, D5). Replaces `MatchStatusBadge`.
 *
 * @example
 * <MatchStatusGlyph status="suggested" />
 * <MatchStatusGlyph status="confirmed" size="sm" />
 */
export function MatchStatusGlyph({
  status,
  size = 'md',
  className,
}: MatchStatusGlyphProps) {
  return (
    <StatusGlyph
      state={MATCH_STATUS_GLYPH_STATE[status]}
      label={MATCH_STATUS_BADGE_STYLES[status].label}
      size={size}
      className={className}
    />
  );
}
