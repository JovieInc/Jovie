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
import { type ReactNode, useEffect, useRef } from 'react';
import { AppIconButton } from '@/components/atoms/AppIconButton';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { AUTH_FORM_MAX_WIDTH_CLASS } from '@/features/auth/constants';
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

const LINK_FOCUS_CLASSES = 'focus-ring-themed rounded-md';

export function AuthLayout({
  children,
  formTitle,
  formTitleClassName = 'text-[18px] leading-[22px] font-medium text-primary-token text-center',
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
  const { isKeyboardVisible } = useMobileKeyboard();
  const formRef = useRef<HTMLElement>(null);

  // Scroll form into view when keyboard appears on mobile
  useEffect(() => {
    if (isKeyboardVisible && formRef.current) {
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

  return (
    <div className='lg:grid lg:min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] bg-[#08090a]'>
      <div
        data-auth-shell
        className={cn(
          // Fixed positioning prevents iOS Safari rubber-band overscroll completely
          // max-w-[100dvw] prevents any content from causing horizontal scroll on mobile
          // At lg+, become a grid cell instead of a fixed overlay — scope mobile-only
          // positioning with max-lg: so non-responsive utilities can't win the cascade.
          'max-lg:fixed max-lg:inset-0 max-lg:max-w-[100dvw] isolate flex flex-col items-center overflow-y-auto overflow-x-clip overscroll-none bg-[#08090a] text-white [color-scheme:dark]',
          'lg:min-h-dvh',
          // Horizontal padding with safe area support for notched devices
          'px-4 sm:px-6',
          // Vertical padding - reduced on mobile, balanced on larger screens
          // Use smaller top padding when keyboard is visible
          isKeyboardVisible
            ? 'pt-8 pb-4'
            : 'pt-10 pb-10 sm:pt-14 sm:pb-12 lg:pt-16',
          // Safe area insets for notched devices (iPhone X+, Android with notches)
          'pb-[max(1.5rem,env(safe-area-inset-bottom))]',
          'pl-[max(1rem,env(safe-area-inset-left))]',
          'pr-[max(1rem,env(safe-area-inset-right))]',
          // Smooth transition when keyboard appears/disappears
          'transition-[padding] duration-200 ease-out'
        )}
      >
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-0 overflow-hidden'
        >
          <div className='absolute left-1/2 top-[10%] h-[24rem] w-[24rem] -translate-x-1/2 rounded-full bg-accent/8 blur-[140px] sm:h-[28rem] sm:w-[28rem]' />
        </div>

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
                <AppIconButton ariaLabel='Open menu' variant='ghost'>
                  <MoreHorizontal />
                </AppIconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end' sideOffset={8}>
                <SignOutButton redirectUrl={logoutRedirectUrl}>
                  <DropdownMenuItem>Log out</DropdownMenuItem>
                </SignOutButton>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}

        {/* Form content - centered with mobile-optimized width */}
        <div
          className={cn(
            `w-full ${AUTH_FORM_MAX_WIDTH_CLASS} relative z-10 flex flex-col items-center`,
            // Allow step indicator to render without clipping
            'overflow-visible'
          )}
        >
          {/* Logo container - inside form wrapper so it centers relative to the Clerk card */}
          <div
            className={cn(
              'mb-6 h-6 w-6 flex items-center justify-center sm:mb-8',
              'transition-opacity duration-200 ease-out',
              // Hide visually when keyboard visible or showLogo=false, but preserve space
              (isKeyboardVisible || !showLogo) &&
                'opacity-0 pointer-events-none'
            )}
            aria-hidden={isKeyboardVisible || !showLogo}
          >
            <Link
              href='/'
              className={`block ${LINK_FOCUS_CLASSES}`}
              aria-label='Go to homepage'
              tabIndex={isKeyboardVisible || !showLogo ? -1 : undefined}
            >
              <span className='inline-flex'>
                <BrandLogo size={24} tone='auto' />
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

          <main
            ref={formRef}
            id='auth-form'
            tabIndex={-1}
            className='w-full scroll-mt-4'
          >
            {children}
          </main>
        </div>

        {/* Footer - hide when keyboard is visible, mt-auto pushes to bottom */}
        {showFooterPrompt && !isKeyboardVisible && (
          <p className='mt-auto pt-8 text-[13px] font-[400] text-[lch(68%_1.35_282)] text-center relative z-10 animate-in fade-in-0 duration-200'>
            {footerPrompt}{' '}
            <Link
              href={footerLinkHref}
              className={`text-white underline ${LINK_FOCUS_CLASSES}`}
            >
              {footerLinkText}
            </Link>
          </p>
        )}
      </div>
      <aside
        aria-hidden='true'
        className='max-lg:hidden lg:flex lg:min-h-dvh lg:items-center lg:justify-center bg-white text-black'
      >
        <BrandLogo size={72} tone='auto' className='text-black' />
      </aside>
    </div>
  );
}
