import { cn } from '@/lib/utils';
import type { ContainerSize, FooterVariantConfig } from './types';

export const CONTAINER_SIZES: Record<ContainerSize, string> = {
  sm: 'max-w-3xl',
  md: 'max-w-5xl',
  lg: 'max-w-6xl',
  xl: 'max-w-7xl',
  full: 'max-w-none',
  homepage: 'max-w-[1100px]',
};

export function getVariantConfigs(
  maxWidthClass: string
): Record<
  'marketing' | 'profile' | 'minimal' | 'regular',
  FooterVariantConfig
> {
  return {
    marketing: {
      containerClass: 'border-t border-subtle bg-base',
      contentClass: cn(
        'mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-4',
        maxWidthClass
      ),
      colorVariant: 'light',
      showBranding: false,
      layout: 'horizontal',
      showLinks: true,
      themeAppearance: 'icon',
    },
    profile: {
      containerClass: 'relative mt-6 pt-4',
      contentClass: '',
      colorVariant: 'light',
      showBranding: true,
      layout: 'vertical',
      showLinks: true,
      themeAppearance: 'icon',
    },
    minimal: {
      containerClass: 'border-t border-subtle bg-base',
      contentClass: cn(
        'mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-3 py-5 md:h-16 md:py-0',
        maxWidthClass
      ),
      colorVariant: 'light',
      showBranding: false,
      layout: 'horizontal',
      showLinks: true,
      themeAppearance: 'segmented',
    },
    regular: {
      containerClass: 'border-t border-subtle bg-base',
      contentClass: cn(
        'mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-6 flex items-center justify-between',
        maxWidthClass
      ),
      colorVariant: 'light',
      showBranding: false,
      layout: 'horizontal',
      showLinks: false,
      themeAppearance: 'segmented',
    },
  };
}

export const FOOTER_LINK_CLASS_NAME = cn(
  'inline-flex rounded-md px-2 py-1.5 -mx-2 -my-1.5',
  'text-[13px] leading-5 font-medium tracking-[-0.01em]',
  'text-secondary-token hover:text-primary-token',
  'transition-all duration-150 ease-out',
  'hover:bg-surface-1',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive focus-visible:ring-offset-2 focus-visible:ring-offset-transparent'
);

export const SECTION_HEADING_CLASS_NAME =
  'text-[11px] leading-4 font-semibold tracking-[0.04em] uppercase text-tertiary-token mb-4';
