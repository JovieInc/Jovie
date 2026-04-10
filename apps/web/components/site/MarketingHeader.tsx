import { HeaderNav } from '@/components/organisms/HeaderNav';

export type MarketingHeaderVariant = 'landing' | 'content' | 'minimal';

export interface MarketingHeaderProps
  extends Readonly<{
    readonly logoSize?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    readonly variant?: MarketingHeaderVariant;
  }> {}

/**
 * Marketing header with a static public auth shell.
 */
export function MarketingHeader({
  logoSize = 'xs',
  variant = 'landing',
}: MarketingHeaderProps) {
  return (
    <HeaderNav
      logoSize={logoSize}
      authMode='public-static'
      hideNav={variant === 'minimal'}
      containerSize='homepage'
    />
  );
}
