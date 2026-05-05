import Image from 'next/image';
import type { CSSProperties } from 'react';
import { getMarketingExportImage } from '@/lib/screenshots/registry';
import { cn } from '@/lib/utils';

interface ProductScreenshotFrameProps {
  readonly scenarioId: string;
  readonly sizes: string;
  readonly priority?: boolean;
  readonly className?: string;
  readonly altOverride?: string;
  readonly device?: 'desktop' | 'phone';
  readonly 'aria-hidden'?: boolean;
}

/**
 * Canonical product-screenshot device frame. Use anywhere a product
 * screenshot needs to feel premium: homepage hero carousel, auth brand
 * panel, marketing pages.
 *
 * - Real capture aspect ratio (no cropping)
 * - 1px lavender hairline border + 4px inner padding (the "device" frame)
 * - Dark `#06070a` inner background so any letterbox bands stay invisible
 *   on dark surfaces and read as the device chassis on light ones
 * - Dramatic 80px depth shadow
 * - `unoptimized` Image — these are local PNGs under /public, no CDN cost,
 *   and the optimizer pipeline misbehaved inside AnimatePresence on auth
 */
export function ProductScreenshotFrame({
  scenarioId,
  sizes,
  priority,
  className,
  altOverride,
  device = 'desktop',
  'aria-hidden': ariaHidden,
}: ProductScreenshotFrameProps) {
  const image = getMarketingExportImage(scenarioId);
  const isPhone = device === 'phone';

  return (
    <div
      data-testid={`product-screenshot-frame-${scenarioId}`}
      className={cn(
        'relative overflow-hidden border border-[rgba(189,189,244,0.09)] bg-[rgba(157,157,255,0.04)] shadow-[0_30px_80px_rgba(0,0,0,0.5)]',
        isPhone ? 'rounded-[28px] p-1.5' : 'rounded-[12px] p-1',
        className
      )}
      style={
        { aspectRatio: `${image.width} / ${image.height}` } as CSSProperties
      }
    >
      <Image
        src={image.publicUrl}
        alt={ariaHidden ? '' : (altOverride ?? image.alt)}
        width={image.width}
        height={image.height}
        priority={priority}
        sizes={sizes}
        unoptimized
        quality={85}
        aria-hidden={ariaHidden}
        className={cn(
          'block h-full w-full bg-[#06070a] object-contain',
          isPhone ? 'rounded-[22px]' : 'rounded-[8px]'
        )}
      />
    </div>
  );
}
