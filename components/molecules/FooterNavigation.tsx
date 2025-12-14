import { FooterLink } from '@/components/ui/FooterLink';

interface FooterNavigationProps {
  variant?: 'light' | 'dark';
  ariaLabel?: string;
  className?: string;
  linkClassName?: string;
  links?: Array<{
    href: string;
    label: string;
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
  const textSize = variant === 'light' ? 'text-sm' : 'text-xs';

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
