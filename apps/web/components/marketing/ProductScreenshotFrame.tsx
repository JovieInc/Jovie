'use client';

import Image from 'next/image';
import { type CSSProperties, useState } from 'react';
import {
  getMarketingExportImage,
  getScreenshotFeatureFocus,
} from '@/lib/screenshots/registry';
import type { ScreenshotFeatureFocus } from '@/lib/screenshots/types';
import { cn } from '@/lib/utils';
import './ProductScreenshotFrame.css';

type FrameStatus = 'loading' | 'loaded' | 'error';

interface ProductScreenshotFrameProps {
  readonly scenarioId: string;
  readonly sizes: string;
  readonly priority?: boolean;
  readonly className?: string;
  readonly altOverride?: string;
  readonly device?: 'desktop' | 'phone';
  /**
   * Surface treatment. `flat` keeps the original hairline card; `dark-glass`
   * applies the founder-locked dark-glass media recipe (JOV-6246, Pen
   * GTcgO → eoUUU): near-black transmissive shell, fine perimeter, blur
   * 20px / saturate 165%, asymmetric illumination, localized reflection.
   */
  readonly variant?: 'flat' | 'dark-glass';
  /**
   * Feature-focus treatment. Pass an explicit region, `null` to disable, or
   * omit to use the scenario's registry-declared `featureFocus` (JOV-6247).
   * Only the presentation outside the region is neutralized; the captured UI
   * stays fully opaque so real Jovie UI and fixture data remain legible.
   */
  readonly focus?: ScreenshotFeatureFocus | null;
  /**
   * Fill the parent container instead of sizing to the image's intrinsic
   * aspect ratio. The parent must enforce dimensions (typically via
   * `aspect-[16/10]` or fixed height). Used when the frame lives inside
   * an absolutely-positioned crossfade slot.
   */
  readonly fill?: boolean;
  readonly 'aria-hidden'?: boolean;
}

function focusVars(focus: ScreenshotFeatureFocus): CSSProperties {
  const vars: Record<string, string> = {
    '--psf-fx': `${focus.region.x}%`,
    '--psf-fy': `${focus.region.y}%`,
    '--psf-fw': `${focus.region.width}%`,
    '--psf-fh': `${focus.region.height}%`,
  };
  if (focus.mobileRegion) {
    vars['--psf-fx-m'] = `${focus.mobileRegion.x}%`;
    vars['--psf-fy-m'] = `${focus.mobileRegion.y}%`;
    vars['--psf-fw-m'] = `${focus.mobileRegion.width}%`;
    vars['--psf-fh-m'] = `${focus.mobileRegion.height}%`;
  }
  return vars as CSSProperties;
}

function FeatureFocusOverlay({
  focus,
}: {
  readonly focus: ScreenshotFeatureFocus;
}) {
  return (
    <div
      className='psf-focus'
      style={focusVars(focus)}
      data-feature-label={focus.label}
    >
      <span
        aria-hidden='true'
        className='psf-focus__scrim psf-focus__scrim--top'
      />
      <span
        aria-hidden='true'
        className='psf-focus__scrim psf-focus__scrim--right'
      />
      <span
        aria-hidden='true'
        className='psf-focus__scrim psf-focus__scrim--bottom'
      />
      <span
        aria-hidden='true'
        className='psf-focus__scrim psf-focus__scrim--left'
      />
      <span aria-hidden='true' className='psf-focus__ring' />
      <span className='psf-focus__label'>{focus.label}</span>
    </div>
  );
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
 * - `variant="dark-glass"` applies the locked large product-frame recipe
 * - `focus` applies the feature-focus treatment without dimming the capture
 */
export function ProductScreenshotFrame({
  scenarioId,
  sizes,
  priority,
  className,
  altOverride,
  device = 'desktop',
  variant = 'flat',
  focus,
  fill,
  'aria-hidden': ariaHidden,
}: ProductScreenshotFrameProps) {
  const image = getMarketingExportImage(scenarioId);
  const isPhone = device === 'phone';
  const [status, setStatus] = useState<FrameStatus>('loading');
  const resolvedFocus =
    focus === undefined ? getScreenshotFeatureFocus(scenarioId) : focus;

  return (
    <div
      data-testid={`product-screenshot-frame-${scenarioId}`}
      data-variant={variant}
      data-status={status}
      className={cn(
        'psf relative overflow-hidden border border-(--color-bg-button) bg-(--color-accent-hover) shadow-[0_30px_80px_rgba(0,0,0,0.5)]',
        variant === 'dark-glass' && 'psf--dark-glass',
        isPhone ? 'rounded-3xl p-1.5' : 'rounded-xl p-1',
        fill && 'h-full w-full',
        className
      )}
      style={
        fill
          ? undefined
          : ({
              aspectRatio: `${image.width} / ${image.height}`,
            } as CSSProperties)
      }
    >
      {status === 'loading' && (
        <div aria-hidden='true' className='psf__skeleton' />
      )}
      {status === 'error' ? (
        <div className='psf__fallback' role='img' aria-label={image.alt}>
          <span className='psf__fallback-title'>{image.alt}</span>
          <span className='psf__fallback-message'>Preview unavailable</span>
        </div>
      ) : (
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
          onLoad={() => setStatus('loaded')}
          onError={() => setStatus('error')}
          className={cn(
            'psf__image block h-full w-full bg-(--color-bg-base) object-contain',
            isPhone
              ? 'rounded-[calc(var(--radius-3xl)-0.375rem)]'
              : 'rounded-lg'
          )}
        />
      )}
      {resolvedFocus && status !== 'error' && (
        <FeatureFocusOverlay focus={resolvedFocus} />
      )}
    </div>
  );
}
