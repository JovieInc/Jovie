export interface FooterProps {
  readonly variant?: 'marketing' | 'profile' | 'minimal' | 'regular';
  readonly artistHandle?: string;
  readonly hideBranding?: boolean;
  readonly artistSettings?: {
    readonly hide_branding?: boolean;
  };
  showThemeToggle?: boolean;
  className?: string;
  themeShortcutKey?: string;
  brandingMark?: 'wordmark' | 'icon';
  containerSize?: 'sm' | 'md' | 'lg' | 'xl' | 'full' | 'homepage';
  links?: Array<{
    href: string;
    label: string;
  }>;
}

export type FooterVariant = 'marketing' | 'profile' | 'minimal' | 'regular';
export type ContainerSize = 'sm' | 'md' | 'lg' | 'xl' | 'full' | 'homepage';
export type ThemeAppearance = 'icon' | 'segmented';
export type FooterLayout = 'horizontal' | 'vertical';
export type ColorVariant = 'light' | 'dark';

export interface FooterVariantConfig {
  containerClass: string;
  contentClass: string;
  colorVariant: ColorVariant;
  showBranding: boolean;
  layout: FooterLayout;
  showLinks: boolean;
  themeAppearance: ThemeAppearance;
}
