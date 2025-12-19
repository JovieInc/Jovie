import { Footer as FooterOrganism } from '@/components/organisms/Footer';

type FooterVersion = 1 | 2 | 'minimal' | 'regular';

interface SiteFooterProps {
  version?: FooterVersion;
  className?: string;
  brandingMark?: 'wordmark' | 'icon';
  themeShortcutKey?: string;
}

export function Footer({
  version,
  className,
  brandingMark,
  themeShortcutKey,
}: SiteFooterProps) {
  const mappedVariant =
    version === 1 || version === 'minimal'
      ? 'minimal'
      : version === 2 || version === 'regular'
        ? 'regular'
        : 'regular';

  return (
    <FooterOrganism
      className={className}
      variant={mappedVariant}
      brandingMark={brandingMark}
      showThemeToggle={true}
      themeShortcutKey={themeShortcutKey}
      links={[
        { href: '/legal/privacy', label: 'Privacy' },
        { href: '/legal/terms', label: 'Terms of Service' },
      ]}
    />
  );
}
