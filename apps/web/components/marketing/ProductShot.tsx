// @coverage-via apps/web/components/marketing/ProductShot.test.tsx
import type { CSSProperties } from 'react';
import {
  getProductShot,
  type ProductShotId,
} from '@/lib/screenshots/product-shots';
import { cn } from '@/lib/utils';
import './ProductShot.css';

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
      style={{ '--product-shot-max-width': `${shot.width}px` } as CSSProperties}
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
