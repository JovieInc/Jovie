// @coverage-via apps/web/components/marketing/ProductShot.test.tsx
import type { CSSProperties } from 'react';
import {
  getProductShot,
  type ProductShotId,
  type ProductShotImage,
} from '@/lib/screenshots/product-shots';
import { cn } from '@/lib/utils';
import './ProductShot.css';

/** Matches the narrow-screen breakpoint in ProductShot.css. */
export const PRODUCT_SHOT_MOBILE_MEDIA = '(max-width: 47.99rem)';

function shotStyle(shot: ProductShotImage): CSSProperties {
  const vars: Record<string, string> = {
    '--product-shot-max-width': `${shot.width}px`,
  };
  if (shot.mobile) {
    vars['--product-shot-mobile-max-width'] = `${shot.mobile.width}px`;
    vars['--product-shot-mobile-ratio'] =
      `${shot.mobile.width} / ${shot.mobile.height}`;
  }
  return vars as CSSProperties;
}

interface ProductShotProps {
  readonly id: ProductShotId;
  /** `sizes` for the rendered width; defaults to the shot's display width. */
  readonly sizes?: string;
  readonly priority?: boolean;
  readonly className?: string;
  /**
   * Stage the shot: a matte card with the UI floating inside on its own
   * radius and hairline (Pen feature bento I8TdQv). Use when the shot sits
   * beside other shots or inside a tile, so cards align at equal heights.
   */
  readonly staged?: boolean;
}

/**
 * The one way marketing pages show product imagery: a registry shot
 * (`lib/screenshots/product-shots.ts`), cropped to one moment, served as AVIF
 * with a WebP fallback at explicit dimensions so it cannot shift layout.
 */
export function ProductShot({
  id,
  sizes,
  priority = false,
  className,
  staged = false,
}: ProductShotProps) {
  const shot = getProductShot(id);
  return (
    <figure
      className={cn(
        'product-shot',
        `product-shot--${shot.frame}`,
        staged && 'product-shot--staged',
        className
      )}
      style={shotStyle(shot)}
      data-product-shot={shot.id}
      data-testid={`product-shot-${shot.id}`}
    >
      {shot.frame === 'window' ? (
        <div className='product-shot__bar' aria-hidden='true'>
          <span />
          <span />
          <span />
        </div>
      ) : null}
      <picture>
        {shot.mobile ? (
          <>
            <source
              media={PRODUCT_SHOT_MOBILE_MEDIA}
              type='image/avif'
              srcSet={shot.mobile.avif}
            />
            <source
              media={PRODUCT_SHOT_MOBILE_MEDIA}
              type='image/webp'
              srcSet={shot.mobile.webp}
            />
          </>
        ) : null}
        <source type='image/avif' srcSet={shot.avif} sizes={sizes} />
        <img
          className='product-shot__image'
          src={shot.webp}
          alt={shot.alt}
          width={shot.width}
          height={shot.height}
          sizes={sizes ?? `${shot.width}px`}
          loading={priority ? 'eager' : 'lazy'}
          decoding='async'
          fetchPriority={priority ? 'high' : 'auto'}
        />
      </picture>
    </figure>
  );
}
