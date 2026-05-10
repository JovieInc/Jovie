import { Footer as FooterOrganism } from '@/components/organisms/footer-module';
import { APP_ROUTES } from '@/constants/routes';

type FooterVersion = 1 | 2 | 'minimal' | 'regular';

interface SiteFooterProps
  extends Readonly<{
    readonly version?: FooterVersion;
    readonly className?: string;
    readonly brandingMark?: 'wordmark' | 'icon';
    readonly containerSize?: 'sm' | 'md' | 'lg' | 'xl' | 'full' | 'homepage';
  }> {}

export function Footer({
  version,
  className,
  brandingMark,
  containerSize,
}: SiteFooterProps) {
  const mappedVariant =
    version === 1 || version === 'minimal' ? 'minimal' : 'regular';

  return (
    <FooterOrganism
      className={className}
      variant={mappedVariant}
      brandingMark={brandingMark}
      containerSize={containerSize}
      links={[
        { href: APP_ROUTES.LEGAL_PRIVACY, label: 'Privacy' },
        { href: APP_ROUTES.LEGAL_TERMS, label: 'Terms' },
      ]}
    />
  );
}
