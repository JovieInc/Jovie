'use client';

import { Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

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
 * 200px fixed width on desktop, hamburger → slide-out sheet on mobile.
 * Pages passed from server layout (manifest loaded server-side).
 */
export function InvestorNav({ investorName, pages }: InvestorNavProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  // Close sheet on navigation
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Close sheet on Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false);
    }
    globalThis.addEventListener('keydown', handleKeyDown);
    return () => globalThis.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const toggleSheet = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  const navLinks = (
    <ul className='flex flex-col gap-0.5'>
      <NavItem
        href='/investor-portal'
        label='Overview'
        isActive={pathname === '/investor-portal'}
      />
      {pages.map(page => (
        <NavItem
          key={page.slug}
          href={`/investor-portal/${page.slug}`}
          label={page.title}
          isActive={pathname === `/investor-portal/${page.slug}`}
        />
      ))}
    </ul>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <nav
        className='max-lg:hidden w-[200px] flex-shrink-0 flex-col border-r border-[var(--color-border-subtle)] bg-[var(--color-bg-surface-0)] px-3 py-6 lg:flex'
        aria-label='Investor portal navigation'
      >
        {/* Branding */}
        <div className='mb-8 px-2'>
          <span className='text-[length:var(--text-lg)] font-bold tracking-tight text-[var(--color-text-primary-token)]'>
            Jovie
          </span>
          {investorName && (
            <p className='mt-1 text-[length:var(--text-xs)] text-[var(--color-text-tertiary-token)]'>
              For {investorName}
            </p>
          )}
        </div>

        {navLinks}
      </nav>

      {/* Mobile header bar */}
      <header className='fixed left-0 right-0 top-0 z-40 flex items-center justify-between border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] px-4 py-3 lg:hidden'>
        <span className='text-[length:var(--text-base)] font-bold text-[var(--color-text-primary-token)]'>
          Jovie
        </span>
        <div className='flex items-center gap-3'>
          {investorName && (
            <span className='text-[length:var(--text-xs)] text-[var(--color-text-tertiary-token)]'>
              For {investorName}
            </span>
          )}
          <button
            type='button'
            onClick={toggleSheet}
            aria-expanded={isOpen}
            aria-controls='mobile-nav'
            aria-label={isOpen ? 'Close navigation' : 'Open navigation'}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-[var(--radius-default)]',
              'text-[var(--color-text-secondary-token)] hover:bg-[var(--color-interactive-hover)]',
              'focus-ring-themed transition-colors'
            )}
          >
            {isOpen ? (
              <X className='h-4 w-4' aria-hidden='true' />
            ) : (
              <Menu className='h-4 w-4' aria-hidden='true' />
            )}
          </button>
        </div>
      </header>

      {/* Mobile nav sheet */}
      {isOpen && (
        <div className='fixed inset-0 z-50 lg:hidden'>
          {/* Backdrop */}
          <button
            type='button'
            className='absolute inset-0 bg-black/50 transition-opacity'
            onClick={() => setIsOpen(false)}
            aria-label='Close navigation'
            tabIndex={-1}
          />

          {/* Sheet panel */}
          <dialog
            id='mobile-nav'
            open
            aria-label='Navigation'
            className='absolute bottom-0 left-0 top-0 m-0 w-64 border-r border-[var(--color-border-subtle)] bg-[var(--color-bg-surface-0)] px-3 py-6'
          >
            {/* Branding */}
            <div className='mb-8 flex items-center justify-between px-2'>
              <div>
                <span className='text-[length:var(--text-lg)] font-bold tracking-tight text-[var(--color-text-primary-token)]'>
                  Jovie
                </span>
                {investorName && (
                  <p className='mt-1 text-[length:var(--text-xs)] text-[var(--color-text-tertiary-token)]'>
                    For {investorName}
                  </p>
                )}
              </div>
              <button
                type='button'
                onClick={() => setIsOpen(false)}
                aria-label='Close navigation'
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-[var(--radius-default)]',
                  'text-[var(--color-text-secondary-token)] hover:bg-[var(--color-interactive-hover)]',
                  'focus-ring-themed transition-colors'
                )}
              >
                <X className='h-4 w-4' aria-hidden='true' />
              </button>
            </div>

            {navLinks}
          </dialog>
        </div>
      )}
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
        className={`block rounded-[var(--radius-sm)] px-2 py-1.5 text-[length:var(--text-app)] font-medium transition-colors ${
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
