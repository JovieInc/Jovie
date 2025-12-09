'use client';

import Link from 'next/link';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { LogoIcon } from '@/components/atoms/LogoIcon';

interface AuthLayoutProps {
  children: ReactNode;
  formTitle: string;
  footerPrompt?: string;
  footerLinkText?: string;
  footerLinkHref?: string;
  showFooterPrompt?: boolean;
  showFormTitle?: boolean;
  logoSpinDelayMs?: number;
  showSkipLink?: boolean;
}

const LINK_FOCUS_CLASSES =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#101012] rounded';

export function AuthLayout({
  children,
  formTitle,
  footerPrompt = "Don't have access?",
  footerLinkText = 'Join the waitlist',
  footerLinkHref = '/waitlist',
  showFooterPrompt = true,
  showFormTitle = true,
  logoSpinDelayMs,
  showSkipLink = true,
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
    <div className='min-h-screen flex flex-col items-center justify-center bg-[#101012] px-4'>
      {/* Skip to main content link for keyboard users */}
      {showSkipLink && (
        <a
          href='#auth-form'
          className='sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-white focus:text-black focus:rounded-lg'
        >
          Skip to form
        </a>
      )}

      {/* Logo */}
      <div className='mb-6'>
        <Link
          href='/'
          className={`block ${LINK_FOCUS_CLASSES}`}
          aria-label='Go to homepage'
        >
          <span
            className={shouldSpinLogo ? 'logo-spin-trigger' : undefined}
            style={logoStyle}
          >
            <LogoIcon size={56} variant='white' />
          </span>
        </Link>
      </div>

      {/* Title */}
      {showFormTitle && (
        <h1 className='text-lg font-medium text-[rgb(227,228,230)] mb-10'>
          {formTitle}
        </h1>
      )}

      {/* Form content */}
      <main id='auth-form' className='w-full max-w-sm' role='main'>
        {children}
      </main>

      {/* Footer */}
      {showFooterPrompt && (
        <p className='mt-10 text-sm text-[#6b6f76]'>
          {footerPrompt}{' '}
          <Link
            href={footerLinkHref}
            className={`text-white hover:underline ${LINK_FOCUS_CLASSES}`}
          >
            {footerLinkText}
          </Link>
        </p>
      )}

      {/* Legal links */}
      <nav
        className='absolute bottom-4 flex gap-4 text-xs text-[#666]'
        aria-label='Legal'
      >
        <Link
          href='/legal/terms'
          className={`hover:text-white transition-colors no-underline ${LINK_FOCUS_CLASSES}`}
        >
          Terms
        </Link>
        <Link
          href='/legal/privacy'
          className={`hover:text-white transition-colors no-underline ${LINK_FOCUS_CLASSES}`}
        >
          Privacy Policy
        </Link>
      </nav>

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
