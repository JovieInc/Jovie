'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavPage {
  readonly slug: string;
  readonly title: string;
}

interface InvestorNavProps {
  readonly investorName: string | null;
  readonly pages: NavPage[];
}

/**
 * Left sidebar navigation for investor portal.
 * 200px fixed width on desktop, hamburger → sheet on mobile.
 * Pages passed from server layout (manifest loaded server-side).
 */
export function InvestorNav({ investorName, pages }: InvestorNavProps) {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop sidebar */}
      <nav
        className='hidden lg:flex w-[200px] flex-shrink-0 flex-col border-r border-[var(--color-border-subtle)] bg-[var(--color-bg-surface-0)] px-3 py-6'
        aria-label='Investor portal navigation'
      >
        {/* Branding */}
        <div className='mb-8 px-2'>
          <span className='text-[length:var(--text-lg)] font-[680] tracking-tight text-[var(--color-text-primary-token)]'>
            Jovie
          </span>
          {investorName && (
            <p className='mt-1 text-[length:var(--text-xs)] text-[var(--color-text-tertiary-token)]'>
              For {investorName}
            </p>
          )}
        </div>

        {/* Nav links */}
        <ul className='flex flex-col gap-0.5'>
          <NavItem
            href='/'
            label='Overview'
            isActive={pathname === '/' || pathname === ''}
          />
          {pages.map(page => (
            <NavItem
              key={page.slug}
              href={`/${page.slug}`}
              label={page.title}
              isActive={pathname === `/${page.slug}`}
            />
          ))}
        </ul>
      </nav>

      {/* Mobile header bar */}
      <header className='lg:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] px-4 py-3'>
        <span className='text-[length:var(--text-base)] font-[680] text-[var(--color-text-primary-token)]'>
          Jovie
        </span>
        {investorName && (
          <span className='text-[length:var(--text-xs)] text-[var(--color-text-tertiary-token)]'>
            For {investorName}
          </span>
        )}
      </header>
    </>
  );
}

function NavItem({
  href,
  label,
  isActive,
}: {
  readonly href: string;
  readonly label: string;
  readonly isActive: boolean;
}) {
  return (
    <li>
      <Link
        href={href}
        aria-current={isActive ? 'page' : undefined}
        className={`block rounded-[var(--radius-sm)] px-2 py-1.5 text-[length:var(--text-app)] font-[510] transition-colors ${
          isActive
            ? 'bg-[var(--color-interactive-hover)] text-[var(--color-text-primary-token)]'
            : 'text-[var(--color-text-tertiary-token)] hover:bg-[var(--color-interactive-hover)] hover:text-[var(--color-text-secondary-token)]'
        }`}
      >
        {label}
      </Link>
    </li>
  );
}
