// @coverage-via apps/web/tests/unit/marketing/editorial-background-contract.test.tsx

import { cn } from '@/lib/utils';
import './MarketingEditorialBackground.css';

export const MARKETING_EDITORIAL_BACKGROUND_SCHEMA =
  'jovie.marketing-editorial-background/v1';
export const MARKETING_EDITORIAL_BACKGROUND_VERSION = 'editorial-background-v1';

export type MarketingEditorialBackgroundVariant = 'soft' | 'flowing';

/**
 * Canonical accent reference for the dominant chromatic core of every
 * editorial background variant (JOV-5265 scene-color policy: the Ion scene
 * role, resolved through the existing System B anchor the electric seam
 * already consumes). Variants may vary lightness/chroma inside the scene
 * palette plausibility corridor; they may not invent a second accent.
 */
export const MARKETING_EDITORIAL_BACKGROUND_ACCENT_TOKEN =
  '--system-b-accent-cyan' as const;

/**
 * Declared composition contract per variant, mirrored from the CSS layer so
 * receiving sections and asset review can reason about focal location, main
 * flow direction, and content-safe areas per viewport without re-measuring
 * the rendered master.
 */
export const MARKETING_EDITORIAL_BACKGROUND_VARIANTS = {
  soft: {
    variant: 'soft',
    /** Broad low-contrast transitions with gentle depth. */
    treatment: 'soft-optical-bloom',
    /** Off-center light source: upper-left, per the approved #21 direction. */
    focalLocation: {
      desktop: 'upper-left',
      mobile: 'upper-left',
    },
    /** Light falls from the upper-left corner down and to the right. */
    mainFlow: 'diagonal-down-right',
    contentSafeAreas: {
      /** Right/below region stays calm dark for receiving copy. */
      desktop: 'right-and-below-focal',
      mobile: 'below-focal',
    },
  },
  flowing: {
    variant: 'flowing',
    /** One dominant sweep with subordinate curves and motivated highlights. */
    treatment: 'directional-sweep',
    /** The sweep enters left, crosses behind content, exits right. */
    focalLocation: {
      desktop: 'left-edge-crossing',
      mobile: 'left-edge-crossing',
    },
    mainFlow: 'left-to-right',
    contentSafeAreas: {
      desktop: 'center-column',
      mobile: 'center-column',
    },
  },
} as const satisfies Record<
  MarketingEditorialBackgroundVariant,
  {
    readonly variant: MarketingEditorialBackgroundVariant;
    readonly treatment: string;
    readonly focalLocation: Readonly<Record<'desktop' | 'mobile', string>>;
    readonly mainFlow: string;
    readonly contentSafeAreas: Readonly<Record<'desktop' | 'mobile', string>>;
  }
>;

export interface MarketingEditorialBackgroundProps {
  readonly variant: MarketingEditorialBackgroundVariant;
  readonly className?: string;
  readonly testId?: string;
}

/**
 * Shared editorial background system (JOV-6249): two variants of one
 * background family behind receiving marketing sections.
 *
 * - `soft` — broad low-contrast optical bloom with an off-center light
 *   source and gentle depth; large calm dark regions for content.
 * - `flowing` — one dominant coherent directional sweep with subordinate
 *   curves and a motivated highlight, flowing with (never crossing) the
 *   content rhythm.
 *
 * Pure CSS substrate (no image/video bytes), tokens only, no typography or
 * chrome of its own. The section keeps its geometry; this component only
 * paints the plane behind it. Static masters: no motion, so reduced-motion
 * and failed-media states degrade to the same approved still.
 */
export function MarketingEditorialBackground({
  variant,
  className,
  testId = 'marketing-editorial-background',
}: MarketingEditorialBackgroundProps) {
  return (
    <div
      aria-hidden='true'
      className={cn(
        'marketing-editorial-background',
        `marketing-editorial-background--${variant}`,
        className
      )}
      data-variant={variant}
      data-testid={testId}
      data-marketing-editorial-accent={
        MARKETING_EDITORIAL_BACKGROUND_ACCENT_TOKEN
      }
    >
      <div
        className='marketing-editorial-background__field'
        data-layer='field'
      />
      <div
        className='marketing-editorial-background__light'
        data-layer='light-source'
      />
      <div className='marketing-editorial-background__flow' data-layer='flow' />
    </div>
  );
}
