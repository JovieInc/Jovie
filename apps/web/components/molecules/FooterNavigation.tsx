import { FooterLink } from '@/components/atoms/FooterLink';
import { APP_ROUTES } from '@/constants/routes';

interface FooterNavigationProps {
  readonly variant?: 'light' | 'dark';
  readonly ariaLabel?: string;
  readonly className?: string;
  readonly linkClassName?: string;
  readonly links?: Array<{
    readonly href: string;
    readonly label: string;
  }>;
}

const defaultLinks = [
  { href: APP_ROUTES.LEGAL_PRIVACY, label: 'Privacy' },
  { href: APP_ROUTES.LEGAL_TERMS, label: 'Terms' },
];

export function FooterNavigation({
  variant = 'dark',
  ariaLabel = 'Footer links',
  className = '',
  linkClassName = '',
  links = defaultLinks,
}: FooterNavigationProps) {
  const textSize =
    variant === 'light'
      ? 'text-app leading-5 font-medium tracking-tight'
      : 'text-[12px] leading-4 font-medium tracking-tight';

  return (
    <nav
      aria-label={ariaLabel}
      className={`flex items-center gap-4 ${textSize} ${className}`}
    >
      {links.map(link => (
        <FooterLink
          key={`${link.href}-${link.label}`}
          href={link.href}
          prefetch={false}
          tone={variant}
          className={linkClassName}
        >
          {link.label}
        </FooterLink>
      ))}
    </nav>
  );
}
