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
        'mx-auto px-6 lg:px-8 py-12 lg:py-16 flex flex-col sm:flex-row items-center justify-between gap-6',
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
        'mx-auto px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4 py-8 md:py-10',
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
        'mx-auto px-6 lg:px-8 pt-12 pb-10 flex items-center justify-between',
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
  'text-[14px] leading-6 font-normal tracking-[-0.01em]',
  'transition-all duration-150 ease-out',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive focus-visible:ring-offset-2 focus-visible:ring-offset-transparent'
);

// Linear-aligned: links are TERTIARY (muted gray), hover to secondary
export const FOOTER_LINK_STYLE = {
  color: 'var(--linear-text-tertiary)',
};

export const FOOTER_LINK_HOVER_CLASS =
  'hover:[color:var(--linear-text-secondary)]';

export const SECTION_HEADING_CLASS_NAME =
  'text-[11px] leading-4 font-semibold tracking-[0.04em] uppercase mb-4';

// Linear-aligned: headings are PRIMARY (white), links are muted
export const SECTION_HEADING_STYLE = {
  color: 'var(--linear-text-primary)',
};
