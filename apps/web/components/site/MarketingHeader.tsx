/**
 * Marketing Header Component
 *
 * Static marketing header for public routes.
 *
 * Supports three variants:
 * - `landing` (default): logo + auth actions
 * - `content`: simplified nav with Logo + Sign in/up only
 * - `minimal`: logo only, no navigation (e.g. investors page)
 *
 * The public marketing shell intentionally avoids client-only scroll logic so
 * the primary CTA can be server-rendered without hydration delay.
 */
import { Header } from '@/components/site/Header';

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
  const hideNav = variant === 'minimal';

  return (
    <Header
      authMode='public-static'
      sticky={false}
      logoSize={logoSize}
      logoVariant='word'
      hideNav={hideNav}
      containerSize='homepage'
      className='border-b'
      style={{
        backgroundColor: 'var(--linear-bg-header)',
        borderBottomColor: 'var(--linear-border-default)',
        color: 'var(--linear-text-primary)',
      }}
    />
  );
}
