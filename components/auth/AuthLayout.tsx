'use client';

import { SignOutButton } from '@clerk/nextjs';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@jovie/ui';
import { MoreHorizontal } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { BrandLogo } from '@/components/atoms/BrandLogo';

interface AuthLayoutProps {
  children: ReactNode;
  formTitle: string;
  formTitleClassName?: string;
  footerPrompt?: string;
  footerLinkText?: string;
  footerLinkHref?: string;
  showFooterPrompt?: boolean;
  showFormTitle?: boolean;
  showLegalLinks?: boolean;
  logoSpinDelayMs?: number;
  showSkipLink?: boolean;
  showLogo?: boolean;
  showLogoutButton?: boolean;
  logoutRedirectUrl?: string;
}

const LINK_FOCUS_CLASSES =
  'focus-ring-themed focus-visible:ring-offset-(--color-bg-base) rounded-md';

export function AuthLayout({
  children,
  formTitle,
  formTitleClassName = 'text-[18px] leading-6 font-medium text-primary-token mb-4 text-center',
  footerPrompt = "Don't have access?",
  footerLinkText = 'Join the waitlist',
  footerLinkHref = '/waitlist',
  showFooterPrompt = true,
  showFormTitle = true,
  showLegalLinks = false,
  logoSpinDelayMs,
  showSkipLink = true,
  showLogo = true,
  showLogoutButton = false,
  logoutRedirectUrl = '/signin',
}: AuthLayoutProps) {
  const [shouldSpinLogo, setShouldSpinLogo] = useState(false);

  // One-time idle-triggered spin
  useEffect(() => {
    if (!logoSpinDelayMs) return undefined;

    let hasSpun = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const triggerSpin = () => {
      if (hasSpun) return;
      hasSpun = true;
      setShouldSpinLogo(true);
    };

    const resetTimer = () => {
      if (hasSpun) return;
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(triggerSpin, logoSpinDelayMs);
    };

    resetTimer();

    const events: Array<keyof DocumentEventMap> = [
      'pointerdown',
      'keydown',
      'mousemove',
      'touchstart',
      'focus',
    ];

    events.forEach(event =>
      window.addEventListener(event, resetTimer, { passive: true })
    );

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      events.forEach(event => window.removeEventListener(event, resetTimer));
    };
  }, [logoSpinDelayMs]);

  const logoStyle = useMemo(
    () =>
      shouldSpinLogo
        ? { animation: 'logo-spin 1.2s ease-in-out 0s 1 forwards' }
        : undefined,
    [shouldSpinLogo]
  );

  return (
    <div className="min-h-screen flex flex-col items-center bg-base px-4 pt-[15vh] sm:pt-[17vh] lg:pt-[19vh] pb-24 relative overflow-hidden before:content-[''] before:absolute before:inset-0 before:bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(120,119,198,0.12),transparent)] dark:before:bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(120,119,198,0.20),transparent)] before:pointer-events-none after:content-[''] after:absolute after:inset-0 after:bg-[radial-gradient(circle_at_center,transparent_40%,rgba(0,0,0,0.03)_100%)] dark:after:bg-[radial-gradient(circle_at_center,transparent_40%,rgba(0,0,0,0.45)_100%)] after:pointer-events-none">
      {/* Skip to main content link for keyboard users */}
      {showSkipLink && (
        <Link
          href='#auth-form'
          className='sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:rounded-md focus:bg-surface-0 focus:text-primary-token focus:border focus:border-subtle focus-ring-themed focus-visible:ring-offset-(--color-bg-base)'
        >
          Skip to form
        </Link>
      )}

      {showLogoutButton ? (
        <div className='absolute top-4 right-4 z-50'>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type='button'
                size='icon'
                variant='ghost'
                className='h-9 w-9 rounded-full border border-subtle bg-transparent text-tertiary-token transition-colors hover:bg-surface-2 hover:text-primary-token focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1'
              >
                <MoreHorizontal className='h-4 w-4' />
                <span className='sr-only'>Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' sideOffset={8}>
              <SignOutButton redirectUrl={logoutRedirectUrl}>
                <DropdownMenuItem>Log out</DropdownMenuItem>
              </SignOutButton>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}

      {/* Logo */}
      <div className='mb-4 h-11 w-11 flex items-center justify-center'>
        {showLogo ? (
          <Link
            href='/'
            className={`block ${LINK_FOCUS_CLASSES}`}
            aria-label='Go to homepage'
          >
            <span
              className={shouldSpinLogo ? 'logo-spin-trigger' : undefined}
              style={logoStyle}
            >
              <BrandLogo size={44} tone='auto' priority />
            </span>
          </Link>
        ) : (
          <span aria-hidden='true' />
        )}
      </div>

      {/* Title */}
      {showFormTitle && <h1 className={formTitleClassName}>{formTitle}</h1>}

      {/* Form content */}
      <main
        id='auth-form'
        className='w-full max-w-[20rem] relative z-10'
        role='main'
      >
        {children}
      </main>

      {/* Footer */}
      {showFooterPrompt && (
        <p className='mt-8 text-sm text-secondary-token text-center relative z-10'>
          {footerPrompt}{' '}
          <Link
            href={footerLinkHref}
            className={`text-primary-token hover:underline ${LINK_FOCUS_CLASSES}`}
          >
            {footerLinkText}
          </Link>
        </p>
      )}

      {/* Legal links */}
      {showLegalLinks && (
        <nav
          className='absolute bottom-4 flex gap-4 text-xs text-secondary-token'
          aria-label='Legal'
        >
          <Link
            href='/legal/terms'
            className={`hover:text-primary-token transition-colors no-underline ${LINK_FOCUS_CLASSES}`}
          >
            Terms
          </Link>
          <Link
            href='/legal/privacy'
            className={`hover:text-primary-token transition-colors no-underline ${LINK_FOCUS_CLASSES}`}
          >
            Privacy Policy
          </Link>
        </nav>
      )}

      {logoSpinDelayMs ? (
        <style jsx>{`
          @keyframes logo-spin {
            from {
              transform: rotate(0deg);
            }
            to {
              transform: rotate(360deg);
            }
          }
          .logo-spin-trigger {
            display: inline-flex;
          }
        `}</style>
      ) : null}
    </div>
  );
}
