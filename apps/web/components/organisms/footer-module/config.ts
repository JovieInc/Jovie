import { cn } from '@/lib/utils';
import type { ContainerSize, FooterVariantConfig } from './types';

export const CONTAINER_SIZES: Record<ContainerSize, string> = {
  sm: 'max-w-3xl',
  md: 'max-w-5xl',
  lg: 'max-w-6xl',
  xl: 'max-w-7xl',
  full: 'max-w-none',
  homepage: 'max-w-none',
};

export function getVariantConfigs(
  maxWidthClass: string,
  containerSize?: ContainerSize
): Record<
  'marketing' | 'profile' | 'minimal' | 'regular',
  FooterVariantConfig
> {
  const isHomepage = containerSize === 'homepage';
  const pxClass = isHomepage ? 'px-5 sm:px-6 lg:px-[77px]' : 'px-6 lg:px-8';
  const mxClass = isHomepage ? '' : 'mx-auto';
  return {
    marketing: {
      containerClass: 'border-t border-subtle bg-base',
      contentClass: cn(
        `${mxClass} ${pxClass} py-12 lg:py-16 flex flex-col sm:flex-row items-center justify-between gap-6`,
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
        `${mxClass} ${pxClass} flex flex-col md:flex-row items-center justify-between gap-4 py-8 md:py-10`,
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
        `${mxClass} ${pxClass} pt-12 pb-10 flex items-center justify-between`,
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
  'inline-flex h-7 items-center',
  'text-[13px] leading-[19.5px] font-normal tracking-[-0.01em]',
  'transition-colors duration-100',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive focus-visible:ring-offset-2 focus-visible:ring-offset-transparent'
);

// Linear-aligned: links are SECONDARY (muted gray), hover to primary
export const FOOTER_LINK_STYLE = {
  color: 'var(--linear-text-secondary)',
};

export const FOOTER_LINK_HOVER_CLASS =
  'hover:[color:var(--linear-text-primary)]';

// Linear: 13px, weight 510, normal case, line-height 19.5px, tracking -0.01em, mb 24px
export const SECTION_HEADING_CLASS_NAME =
  'text-[13px] leading-[19.5px] font-[510] tracking-[-0.01em] mb-6';

// Linear-aligned: headings are PRIMARY (white), links are muted
export const SECTION_HEADING_STYLE = {
  color: 'var(--linear-text-primary)',
};
