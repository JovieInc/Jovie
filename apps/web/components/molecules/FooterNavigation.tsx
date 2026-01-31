import { FooterLink } from '@/components/ui/FooterLink';

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
  { href: '/legal/privacy', label: 'Privacy' },
  { href: '/legal/terms', label: 'Terms' },
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
      ? 'text-[13px] leading-5 font-medium tracking-tight'
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
          tone={variant}
          className={linkClassName}
        >
          {link.label}
        </FooterLink>
      ))}
    </nav>
  );
}
