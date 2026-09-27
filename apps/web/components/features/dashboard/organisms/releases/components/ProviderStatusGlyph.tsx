import { StatusGlyph, type StatusGlyphState } from '@jovie/ui';
import { memo } from 'react';

/**
 * ProviderStatusGlyph — provider-link provenance indicator next to a
 * release's provider link (Spotify, Apple Music, etc.) in the dashboard
 * Releases table. Adapter over the canonical `StatusGlyph` (Pen jAcP1, D5);
 * replaces `ProviderStatusDot`.
 *
 * Status -> meaning -> glyph:
 *
 *   available  Auto-synced provider link (pulled from the provider API) —
 *              done (check), calm default.
 *   manual     Manually added provider link (artist pasted a URL) —
 *              warning, signals "exists but wasn't verified".
 *   missing    No provider link on file — todo (empty), "nothing here yet".
 *
 * Color is never the only signal: each state uses a distinct glyph fill,
 * exposes an aria-label, and is wrapped in a tooltip by `StatusGlyph`.
 * `data-provider-status` is emitted for tests and styling hooks.
 */

const PROVIDER_STATUS_LABELS = {
  available: 'Auto-synced provider link',
  manual: 'Manually added provider link',
  missing: 'Missing provider link',
} as const;

export type ProviderStatus = keyof typeof PROVIDER_STATUS_LABELS;

const PROVIDER_STATUS_GLYPH_STATE: Record<ProviderStatus, StatusGlyphState> = {
  available: 'done',
  manual: 'warning',
  missing: 'todo',
};

interface ProviderStatusGlyphProps {
  readonly status: ProviderStatus;
}

export const ProviderStatusGlyph = memo(function ProviderStatusGlyph({
  status,
}: Readonly<ProviderStatusGlyphProps>) {
  return (
    <StatusGlyph
      state={PROVIDER_STATUS_GLYPH_STATE[status]}
      tooltipLabel={PROVIDER_STATUS_LABELS[status]}
      data-provider-status={status}
    />
  );
});
