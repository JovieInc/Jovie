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
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { CircleIconButton } from '@/components/atoms/CircleIconButton';
import { AUTH_FORM_MAX_WIDTH_CLASS } from '@/components/auth/constants';
import { useMobileKeyboard } from '@/hooks/useMobileKeyboard';
import { cn } from '@/lib/utils';

interface AuthLayoutProps {
  readonly children: ReactNode;
  readonly formTitle: string;
  readonly formTitleClassName?: string;
  readonly footerPrompt?: string;
  readonly footerLinkText?: string;
  readonly footerLinkHref?: string;
  readonly showFooterPrompt?: boolean;
  readonly showFormTitle?: boolean;
  readonly logoSpinDelayMs?: number;
  readonly showSkipLink?: boolean;
  readonly showLogo?: boolean;
  readonly showLogoutButton?: boolean;
  readonly logoutRedirectUrl?: string;
}

const LINK_FOCUS_CLASSES =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6c78e6]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f5f5f5] dark:focus-visible:ring-offset-[#090909] rounded-md';

export function AuthLayout({
  children,
  formTitle,
  formTitleClassName = 'text-[18px] leading-[22px] font-medium text-[#1f2023] dark:text-[#e3e4e6] text-center',
  footerPrompt = "Don't have access?",
  footerLinkText = 'Join the waitlist',
  footerLinkHref = '/waitlist',
  showFooterPrompt = true,
  showFormTitle = true,
  logoSpinDelayMs,
  showSkipLink = true,
  showLogo = true,
  showLogoutButton = false,
  logoutRedirectUrl = '/signin',
}: Readonly<AuthLayoutProps>) {
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
      globalThis.addEventListener(event, resetTimer, { passive: true })
    );

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      events.forEach(event =>
        globalThis.removeEventListener(event, resetTimer)
      );
    };
  }, [logoSpinDelayMs]);

  return (
    <div
      className={cn(
        // Fixed positioning prevents iOS Safari rubber-band overscroll completely
        // max-w-[100dvw] prevents any content from causing horizontal scroll on mobile
        'fixed inset-0 flex flex-col items-center bg-surface-0 text-primary-token overflow-y-auto overflow-x-clip overscroll-none max-w-[100dvw]',
        // Horizontal padding with safe area support for notched devices
        'px-4 sm:px-6',
        // Vertical padding - reduced on mobile, increases on larger screens
        // Use smaller top padding when keyboard is visible
        isKeyboardVisible ? 'pt-8 pb-4' : 'pt-[18vh] sm:pt-[20vh] pb-12',
        // Safe area insets for notched devices (iPhone X+, Android with notches)
        'pb-[max(1.5rem,env(safe-area-inset-bottom))]',
        'pl-[max(1rem,env(safe-area-inset-left))]',
        'pr-[max(1rem,env(safe-area-inset-right))]',
        // Smooth transition when keyboard appears/disappears
        'transition-[padding] duration-200 ease-out'
      )}
    >
      {/* Skip to main content link for keyboard users */}
      {showSkipLink && (
        <Link
          href='#auth-form'
          className='sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:rounded-md focus:bg-surface-1 focus:text-primary-token focus:border focus:border-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0'
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

      {/* Logo container - fixed dimensions to prevent layout shift between screens */}
      <div
        className={cn(
          'mb-8 h-12 w-12 flex items-center justify-center',
          'transition-opacity duration-200 ease-out',
          // Hide visually when keyboard visible or showLogo=false, but preserve space
          (isKeyboardVisible || !showLogo) && 'opacity-0 pointer-events-none'
        )}
        aria-hidden={isKeyboardVisible || !showLogo}
      >
        <Link
          href='/'
          className={`block ${LINK_FOCUS_CLASSES}`}
          aria-label='Go to homepage'
          tabIndex={isKeyboardVisible || !showLogo ? -1 : undefined}
        >
          <span
            className={
              shouldSpinLogo ? 'inline-flex animate-logo-spin' : 'inline-flex'
            }
          >
            <BrandLogo size={48} tone='auto' priority />
          </span>
        </Link>
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
          `w-full ${AUTH_FORM_MAX_WIDTH_CLASS} relative z-10`,
          // Smooth scroll target
          'scroll-mt-4',
          // Prevent horizontal overflow from child elements
          'overflow-x-clip'
        )}
      >
        {children}
      </main>

      {/* Footer - hide when keyboard is visible */}
      {showFooterPrompt && !isKeyboardVisible && (
        <p className='mt-8 text-[13px] font-[450] text-[#6b6f76] dark:text-[#969799] text-center relative z-10 animate-in fade-in-0 duration-200'>
          {footerPrompt}{' '}
          <Link
            href={footerLinkHref}
            className={`text-[#1f2023] dark:text-[#e3e4e6] hover:underline ${LINK_FOCUS_CLASSES}`}
          >
            {footerLinkText}
          </Link>
        </p>
      )}
    </div>
  );
}
