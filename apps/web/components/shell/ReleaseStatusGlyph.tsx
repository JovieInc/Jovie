import { StatusGlyph, type StatusGlyphSize } from '@jovie/ui';
import {
  RELEASE_STATUS_GLYPH_STATE,
  RELEASE_STATUS_LABEL,
  type ReleaseStatus,
} from '@/lib/status/release-status';

export interface ReleaseStatusGlyphProps {
  readonly status: ReleaseStatus;
  readonly size?: StatusGlyphSize;
  readonly className?: string;
}

/**
 * Release-status adapter over the canonical `StatusGlyph` (Pen jAcP1, D5).
 * Renders the glyph plus its status label; the tooltip and aria-label carry
 * the same word for icon-only contexts.
 */
export function ReleaseStatusGlyph({
  status,
  size,
  className,
}: ReleaseStatusGlyphProps) {
  return (
    <StatusGlyph
      state={RELEASE_STATUS_GLYPH_STATE[status]}
      label={RELEASE_STATUS_LABEL[status]}
      size={size}
      className={className}
    />
  );
}
