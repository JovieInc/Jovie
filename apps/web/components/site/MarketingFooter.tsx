'use client';

import { usePathname } from 'next/navigation';
import { Footer as FooterOrganism } from '@/components/organisms/footer-module';
import { APP_ROUTES } from '@/constants/routes';

interface MarketingFooterProps {
  readonly variant?: 'auto' | 'expanded' | 'minimal';
}

export function MarketingFooter({
  variant = 'auto',
}: Readonly<MarketingFooterProps>) {
  const pathname = usePathname();
  const resolvedVariant =
    variant === 'auto'
      ? pathname === APP_ROUTES.PRICING
        ? 'regular'
        : 'minimal'
      : variant === 'expanded'
        ? 'regular'
        : 'minimal';

  return (
    <FooterOrganism
      variant={resolvedVariant}
      brandingMark='icon'
      containerSize='homepage'
      showThemeToggle={false}
      links={[
        { href: APP_ROUTES.LEGAL_PRIVACY, label: 'Privacy' },
        { href: APP_ROUTES.LEGAL_TERMS, label: 'Terms' },
      ]}
    />
  );
}
