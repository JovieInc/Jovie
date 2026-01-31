import { Footer as FooterOrganism } from '@/components/organisms/footer-module';

type FooterVersion = 1 | 2 | 'minimal' | 'regular';

interface SiteFooterProps
  extends Readonly<{
    readonly version?: FooterVersion;
    readonly className?: string;
    readonly brandingMark?: 'wordmark' | 'icon';
    readonly containerSize?: 'sm' | 'md' | 'lg' | 'xl' | 'full' | 'homepage';
    readonly themeShortcutKey?: string;
    readonly showThemeToggle?: boolean;
  }> {}

export function Footer({
  version,
  className,
  brandingMark,
  containerSize,
  themeShortcutKey,
  showThemeToggle = true,
}: SiteFooterProps) {
  const mappedVariant =
    version === 1 || version === 'minimal' ? 'minimal' : 'regular';

  return (
    <FooterOrganism
      className={className}
      variant={mappedVariant}
      brandingMark={brandingMark}
      containerSize={containerSize}
      showThemeToggle={showThemeToggle}
      themeShortcutKey={themeShortcutKey}
      links={[
        { href: '/legal/privacy', label: 'Privacy' },
        { href: '/legal/terms', label: 'Terms of Service' },
      ]}
    />
  );
}
