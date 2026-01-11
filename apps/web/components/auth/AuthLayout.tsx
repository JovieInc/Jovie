'use client';

import { SignOutButton } from '@clerk/nextjs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@jovie/ui';
import { MoreHorizontal } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { CircleIconButton } from '@/components/atoms/CircleIconButton';
import { useMobileKeyboard } from '@/hooks/useMobileKeyboard';
import { cn } from '@/lib/utils';

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
  formTitleClassName = 'text-lg leading-6 font-medium text-primary-token mb-4 text-center',
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
  const { isKeyboardVisible } = useMobileKeyboard();
  const formRef = useRef<HTMLDivElement>(null);

  // Scroll form into view when keyboard appears on mobile
  useEffect(() => {
    if (isKeyboardVisible && formRef.current) {
      // Slight delay to let keyboard fully appear
      const timer = setTimeout(() => {
        formRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }, 100);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [isKeyboardVisible]);

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
    <div
      className={cn(
        // Base layout - use dvh for mobile keyboard handling, fall back to vh
        'min-h-[100dvh] supports-[height:100dvh]:min-h-[100dvh] flex flex-col items-center bg-base relative overflow-x-hidden',
        // Horizontal padding with safe area support for notched devices
        'px-4 sm:px-6',
        // Vertical padding - reduced on mobile, increases on larger screens
        // Use smaller top padding when keyboard is visible
        isKeyboardVisible
          ? 'pt-8 pb-4'
          : 'pt-[12vh] sm:pt-[15vh] lg:pt-[19vh] pb-24',
        // Safe area insets for notched devices (iPhone X+, Android with notches)
        'pb-[max(1.5rem,env(safe-area-inset-bottom))]',
        'pl-[max(1rem,env(safe-area-inset-left))]',
        'pr-[max(1rem,env(safe-area-inset-right))]',
        // Smooth transition when keyboard appears/disappears
        'transition-[padding] duration-200 ease-out',
        // Background gradients
        "before:content-[''] before:absolute before:inset-0 before:bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(120,119,198,0.12),transparent)] dark:before:bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(120,119,198,0.20),transparent)] before:pointer-events-none",
        "after:content-[''] after:absolute after:inset-0 after:bg-[radial-gradient(circle_at_center,transparent_40%,rgba(0,0,0,0.03)_100%)] dark:after:bg-[radial-gradient(circle_at_center,transparent_40%,rgba(0,0,0,0.45)_100%)] after:pointer-events-none"
      )}
    >
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
              <CircleIconButton
                size='sm'
                variant='outline'
                ariaLabel='Open menu'
              >
                <MoreHorizontal />
              </CircleIconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' sideOffset={8}>
              <SignOutButton redirectUrl={logoutRedirectUrl}>
                <DropdownMenuItem>Log out</DropdownMenuItem>
              </SignOutButton>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}

      {/* Logo - hide on mobile when keyboard is visible */}
      <div
        className={cn(
          'mb-4 h-11 w-11 flex items-center justify-center',
          'transition-all duration-200 ease-out',
          isKeyboardVisible && 'opacity-0 h-0 mb-0 pointer-events-none'
        )}
        aria-hidden={isKeyboardVisible}
      >
        {showLogo ? (
          <Link
            href='/'
            className={`block ${LINK_FOCUS_CLASSES}`}
            aria-label='Go to homepage'
            tabIndex={isKeyboardVisible ? -1 : undefined}
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

      {/* Title - hide when keyboard is visible on mobile */}
      {showFormTitle && formTitle && (
        <h1
          className={cn(
            formTitleClassName,
            'transition-all duration-200 ease-out',
            isKeyboardVisible && 'opacity-0 h-0 mb-0 overflow-hidden'
          )}
          aria-hidden={isKeyboardVisible}
        >
          {formTitle}
        </h1>
      )}

      {/* Form content - centered with mobile-optimized width */}
      <main
        ref={formRef}
        id='auth-form'
        className={cn(
          'w-full max-w-[20rem] sm:max-w-[22rem] relative z-10',
          // Ensure touch targets are easily reachable
          '[&_input]:text-base [&_input]:sm:text-sm',
          // Prevent iOS zoom on input focus (requires 16px font)
          '[&_input]:min-h-[48px]',
          // Smooth scroll target
          'scroll-mt-4'
        )}
      >
        {children}
      </main>

      {/* Footer - hide when keyboard is visible */}
      {showFooterPrompt && !isKeyboardVisible && (
        <p className='mt-8 text-sm text-secondary-token text-center relative z-10 animate-in fade-in-0 duration-200'>
          {footerPrompt}{' '}
          <Link
            href={footerLinkHref}
            className={`text-primary-token hover:underline ${LINK_FOCUS_CLASSES}`}
          >
            {footerLinkText}
          </Link>
        </p>
      )}

      {/* Legal links - hide when keyboard is visible, with safe area support */}
      {showLegalLinks && !isKeyboardVisible && (
        <nav
          className={cn(
            'absolute flex gap-4 text-xs text-secondary-token',
            // Position with safe area inset support
            'bottom-[max(1rem,env(safe-area-inset-bottom))]',
            'animate-in fade-in-0 duration-200'
          )}
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
