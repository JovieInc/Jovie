/**
 * MarketingEditorialBackground — soft / flowing editorial background
 * masters (JOV-6249).
 *
 * Two variants of one shared background system over the locked System B
 * sources cited by the media-recipe contract (JOV-6246):
 * - `soft` — the homepage editorial-hero light well: broad low-contrast
 *   radial curve, off-center illumination, large calm dark regions.
 * - `flowing` — one dominant horizontal sweep: the electric seam with the
 *   newer-hero soft optical bloom B behind it.
 *
 * Do not invent new mixes, blurs, opacities, or accent hues here — every
 * value mirrors its locked source (see apps/web/data/marketing/mediaRecipes.ts
 * and apps/web/app/(home)/home.css).
 */

import { MarketingElectricSeam } from '@/components/marketing/MarketingElectricSeam';
import { cn } from '@/lib/utils';
import './MarketingEditorialBackground.css';

export const MARKETING_EDITORIAL_BACKGROUND_VARIANTS = [
  'soft',
  'flowing',
] as const;

export type MarketingEditorialBackgroundVariant =
  (typeof MARKETING_EDITORIAL_BACKGROUND_VARIANTS)[number];

export interface MarketingEditorialBackgroundProps {
  /**
   * `soft` renders the quiet static field (light well + underlight) with no
   * motion. `flowing` renders the directional sweep (bloom B + electric
   * seam); under reduced motion the seam falls back to its static glow.
   */
  readonly variant: MarketingEditorialBackgroundVariant;
  /** Stable seed passed through to the seam's SVG filter/keyframe ids. */
  readonly idSeed?: string;
  readonly className?: string;
  readonly children?: React.ReactNode;
}

function isMarketingEditorialBackgroundVariant(
  value: string
): value is MarketingEditorialBackgroundVariant {
  return (
    MARKETING_EDITORIAL_BACKGROUND_VARIANTS as readonly string[]
  ).includes(value);
}

export function isFlowingEditorialBackgroundReducedMotionFallback(
  spark: boolean,
  prefersReducedMotion: boolean
): boolean {
  return spark && !prefersReducedMotion;
}

/**
 * Shared full-bleed editorial background. Occupies the receiving section's
 * full background layer behind real content; the content column keeps its
 * own typography/geometry (children render above the field on `z-index: 1`).
 * Safe areas are the receiving section's existing content paddings — the
 * field is paint-only (`pointer-events: none`, `aria-hidden`) and clips
 * behind the section's overflow, so it cannot clip foreground material.
 */
export function MarketingEditorialBackground({
  variant,
  idSeed,
  className,
  children,
}: MarketingEditorialBackgroundProps) {
  if (!isMarketingEditorialBackgroundVariant(variant)) {
    throw new Error(
      `MarketingEditorialBackground: unknown variant "${variant}". Use ${MARKETING_EDITORIAL_BACKGROUND_VARIANTS.join(' | ')}.`
    );
  }

  return (
    <div
      className={cn('meb', `meb--${variant}`, className)}
      data-testid={`marketing-editorial-background-${variant}`}
      data-variant={variant}
    >
      <div
        className='meb__field'
        aria-hidden='true'
        data-testid={`marketing-editorial-background-field-${variant}`}
      >
        {variant === 'soft' && <div className='meb__light-well' />}
        {variant === 'flowing' && (
          <>
            <div className='meb__bloom' />
            <div className='meb__seam'>
              <MarketingElectricSeam idSeed={idSeed ?? 'meb-flowing'} />
            </div>
          </>
        )}
      </div>
      {children && (
        <div className='meb__content' data-meb-layer='content'>
          {children}
        </div>
      )}
    </div>
  );
}
