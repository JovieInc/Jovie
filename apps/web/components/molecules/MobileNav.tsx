'use client';

import { ArrowRight, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { UserButton } from '@/components/organisms/user-button';

import { APP_ROUTES } from '@/constants/routes';
import { useAuthSafe } from '@/hooks/useClerkSafe';
import { useIsAuthenticated } from '@/hooks/useIsAuthenticated';
import { cn } from '@/lib/utils';

export function MobileNav({
  hidePricingLink = false,
}: {
  readonly hidePricingLink?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const isAuthed = useIsAuthenticated();
  const { isSignedIn: clerkSignedIn } = useAuthSafe();
  const showAuthenticatedAction = isAuthed && clerkSignedIn;

  const close = useCallback(() => setIsOpen(false), []);

  // Close menu on route changes
  useEffect(() => {
    close();
  }, [pathname, close]);

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        close();
        toggleRef.current?.focus();
      }
    }
    if (isOpen) {
      document.addEventListener('keydown', onKeyDown);
      return () => document.removeEventListener('keydown', onKeyDown);
    }
  }, [isOpen, close]);

  const navLinks = [
    ...(!hidePricingLink ? [{ href: '/pricing', label: 'Pricing' }] : []),
    ...(showAuthenticatedAction
      ? []
      : [{ href: APP_ROUTES.SIGNIN, label: 'Log in' }]),
  ];

  return (
    <>
      {/* Toggle button */}
      <button
        ref={toggleRef}
        type='button'
        onClick={() => setIsOpen(prev => !prev)}
        className={cn(
          'relative z-[101] inline-flex items-center justify-center size-10',
          'rounded-lg border-0 bg-transparent cursor-pointer',
          'text-[var(--linear-text-primary)]',
          'transition-all duration-200 ease-out',
          '-webkit-tap-highlight-color-transparent',
          'hover:bg-[var(--linear-bg-hover)]',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--linear-accent)]'
        )}
        aria-label={isOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={isOpen}
        aria-controls='mobile-nav-panel'
      >
        <div className='relative size-5'>
          {/* Hamburger → X morphing */}
          <Menu
            size={20}
            className={cn(
              'absolute inset-0 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
              isOpen
                ? 'opacity-0 rotate-90 scale-75'
                : 'opacity-100 rotate-0 scale-100'
            )}
          />
          <X
            size={20}
            className={cn(
              'absolute inset-0 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
              isOpen
                ? 'opacity-100 rotate-0 scale-100'
                : 'opacity-0 -rotate-90 scale-75'
            )}
          />
        </div>
      </button>

      {/* Full-screen overlay */}
      <div
        className={cn(
          'fixed inset-0 z-[99]',
          'transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
          isOpen
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none'
        )}
        onClick={close}
        aria-hidden='true'
        style={{
          background: 'oklch(0% 0 0 / 0.6)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
      />

      {/* Navigation panel */}
      <nav
        id='mobile-nav-panel'
        className={cn(
          'fixed inset-x-0 bottom-0 z-[100]',
          'rounded-t-[20px]',
          'transition-all duration-[320ms] ease-[cubic-bezier(0.32,0.72,0,1)]',
          isOpen
            ? 'translate-y-0 opacity-100 pointer-events-auto'
            : 'translate-y-full opacity-0 pointer-events-none'
        )}
        style={{
          backgroundColor:
            'color-mix(in oklab, var(--linear-bg-surface-0) 95%, white 5%)',
          borderTop:
            '1px solid color-mix(in oklab, var(--linear-border-subtle) 85%, white 15%)',
          boxShadow:
            '0 -8px 40px oklch(0% 0 0 / 0.25), 0 -2px 12px oklch(0% 0 0 / 0.15)',
          paddingBottom: 'calc(24px + env(safe-area-inset-bottom))',
        }}
        aria-label='Mobile navigation'
        aria-hidden={!isOpen}
      >
        {/* Grabber handle */}
        <div className='flex justify-center pt-3 pb-2' aria-hidden='true'>
          <div
            className='w-9 h-[5px] rounded-full'
            style={{
              background:
                'color-mix(in oklab, var(--linear-text-tertiary) 40%, transparent)',
            }}
          />
        </div>

        {/* Nav links */}
        <div className='flex flex-col gap-1 px-4 pt-1'>
          {navLinks.map((link, index) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'flex items-center h-[52px] px-4 rounded-xl',
                'text-[17px] font-medium',
                'text-[var(--linear-text-primary)]',
                'transition-all duration-150 ease-out',
                'active:scale-[0.98]',
                'hover:bg-[var(--linear-bg-hover)]',
                // Staggered entrance animation
                isOpen && 'animate-[mobile-nav-item-in_400ms_ease-out_both]'
              )}
              style={{
                animationDelay: isOpen ? `${80 + index * 50}ms` : '0ms',
              }}
              onClick={close}
            >
              {link.label}
            </Link>
          ))}

          {/* Primary CTA */}
          <div
            className={cn(
              'pt-2',
              isOpen && 'animate-[mobile-nav-item-in_400ms_ease-out_both]'
            )}
            style={{
              animationDelay: isOpen ? `${80 + navLinks.length * 50}ms` : '0ms',
            }}
          >
            {showAuthenticatedAction ? (
              <Link
                href={APP_ROUTES.DASHBOARD}
                className={cn(
                  'group flex items-center justify-center gap-2 h-[52px] rounded-xl',
                  'text-[17px] font-semibold',
                  'transition-all duration-200 ease-out',
                  'active:scale-[0.98]'
                )}
                style={{
                  color: 'var(--linear-btn-primary-fg)',
                  backgroundColor: 'var(--linear-btn-primary-bg)',
                  border: '1px solid var(--linear-btn-primary-border)',
                  boxShadow: 'var(--linear-shadow-button)',
                }}
                onClick={close}
              >
                Open App
                <ArrowRight
                  size={16}
                  className='transition-transform duration-200 group-hover:translate-x-0.5'
                />
              </Link>
            ) : (
              <Link
                href={APP_ROUTES.WAITLIST}
                className={cn(
                  'group flex items-center justify-center gap-2 h-[52px] rounded-xl',
                  'text-[17px] font-semibold',
                  'transition-all duration-200 ease-out',
                  'active:scale-[0.98]'
                )}
                style={{
                  color: 'var(--linear-btn-primary-fg)',
                  backgroundColor: 'var(--linear-btn-primary-bg)',
                  border: '1px solid var(--linear-btn-primary-border)',
                  boxShadow: 'var(--linear-shadow-button)',
                }}
                onClick={close}
              >
                Sign up
                <ArrowRight
                  size={16}
                  className='transition-transform duration-200 group-hover:translate-x-0.5'
                />
              </Link>
            )}
          </div>
        </div>

        {/* User section (authenticated) */}
        {showAuthenticatedAction && (
          <div
            className={cn(
              'mx-4 mt-4 pt-4',
              'border-t border-[var(--linear-border-subtle)]',
              isOpen && 'animate-[mobile-nav-item-in_400ms_ease-out_both]'
            )}
            style={{
              animationDelay: isOpen
                ? `${80 + (navLinks.length + 1) * 50}ms`
                : '0ms',
            }}
          >
            <UserButton />
          </div>
        )}
      </nav>
    </>
  );
}
