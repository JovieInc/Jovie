// @coverage-via apps/web/tests/unit/marketing/editorial-backgrounds.test.ts
import './MarketingEditorialBackground.css';

import {
  getMarketingEditorialBackground,
  type MarketingEditorialBackgroundVariantId,
} from '@/data/marketing';
import { cn } from '@/lib/utils';

export interface MarketingEditorialBackgroundProps {
  /** Registered variant: 'soft' (quiet atmosphere) or 'flow' (directional sweep). */
  readonly variant: MarketingEditorialBackgroundVariantId;
  readonly className?: string;
  readonly testId?: string;
}

/**
 * Full-bleed editorial section background (JOV-6249), implementing the
 * JOV-6246 approved masters as static CSS/SVG. Purely decorative —
 * `aria-hidden` and `pointer-events: none` keep it out of the accessibility
 * tree and interaction path. Place inside a `position: relative` section;
 * foreground content keeps its own stacking above (`z-index` on the section
 * content wrapper).
 *
 * Masters are static by design: reduced-motion and failed-media states fall
 * back to these same approved stills, so no runtime motion wiring is needed.
 */
export function MarketingEditorialBackground({
  variant,
  className,
  testId,
}: Readonly<MarketingEditorialBackgroundProps>) {
  const spec = getMarketingEditorialBackground(variant);
  const curves = spec.curves.list;

  return (
    <div
      aria-hidden='true'
      className={cn('marketing-editorial-background', className)}
      data-testid={testId}
      data-variant={variant}
    >
      <div className='marketing-editorial-background__washes' />
      {curves.length > 0 && (
        <svg
          aria-hidden='true'
          className='marketing-editorial-background__curves'
          preserveAspectRatio='none'
          shapeRendering='geometricPrecision'
          viewBox={spec.curves.viewBox}
        >
          <defs>
            <linearGradient
              id={`marketing-editorial-background-sweep-${variant}`}
              x1='0'
              x2='1'
              y1='0'
              y2='0'
            >
              <stop
                offset='0'
                stopColor='var(--system-b-accent-cyan)'
                stopOpacity='0'
              />
              <stop
                offset='0.62'
                stopColor='var(--system-b-accent-cyan)'
                stopOpacity='0.5'
              />
              <stop
                offset='1'
                stopColor='var(--system-b-accent-cyan)'
                stopOpacity='0'
              />
            </linearGradient>
          </defs>
          {curves.map(curve => (
            <path
              key={curve.path}
              d={curve.path}
              data-weight={curve.weight}
              fill='none'
              stroke={`url(#marketing-editorial-background-sweep-${variant})`}
              strokeLinecap='round'
            />
          ))}
        </svg>
      )}
    </div>
  );
}
