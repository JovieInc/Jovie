import { Footer as FooterOrganism } from '@/components/organisms/footer-module';

type FooterVersion = 1 | 2 | 'minimal' | 'regular';

interface SiteFooterProps {
  version?: FooterVersion;
  className?: string;
  brandingMark?: 'wordmark' | 'icon';
  containerSize?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  themeShortcutKey?: string;
}

export function Footer({
  version,
  className,
  brandingMark,
  containerSize,
  themeShortcutKey,
}: SiteFooterProps) {
  const mappedVariant =
    version === 1 || version === 'minimal' ? 'minimal' : 'regular';

  return (
    <FooterOrganism
      className={className}
      variant={mappedVariant}
      brandingMark={brandingMark}
      containerSize={containerSize}
      showThemeToggle={true}
      themeShortcutKey={themeShortcutKey}
      links={[
        { href: '/legal/privacy', label: 'Privacy' },
        { href: '/legal/terms', label: 'Terms of Service' },
      ]}
    />
  );
}
