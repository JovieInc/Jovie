import {
  type LogoAssetNormalization,
  normalizedLogoStyle,
} from '@jovie/ui/media/logo-normalization';
import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface NormalizedLogoAssetProps {
  readonly asset: LogoAssetNormalization;
  readonly children: ReactNode;
  readonly className?: string;
  /** Scale the complete normalized canvas with a constrained frame. */
  readonly fit?: 'natural' | 'contain';
}

export function NormalizedLogoAsset({
  asset,
  children,
  className,
  fit = 'natural',
}: Readonly<NormalizedLogoAssetProps>) {
  return (
    <span
      data-logo-asset={asset.id}
      className={cn(
        'relative inline-block h-[var(--logo-frame-height)] w-[var(--logo-frame-width)] overflow-visible [&>*]:absolute [&>*]:left-0 [&>*]:top-0 [&>*]:block [&>*]:h-[var(--logo-render-height)] [&>*]:w-[var(--logo-render-width)] [&>*]:max-w-none [&>*]:translate-x-[var(--logo-offset-x)] [&>*]:translate-y-[var(--logo-offset-y)]',
        fit === 'contain' &&
          'h-auto max-w-full aspect-[var(--logo-frame-aspect)]',
        className
      )}
      style={normalizedLogoStyle(asset, fit) as CSSProperties}
    >
      {children}
    </span>
  );
}
