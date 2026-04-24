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
import { AuthBrandPanel } from './AuthBrandPanel';

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
  readonly layoutVariant?: 'stack' | 'split';
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
  layoutVariant = 'stack',
}: Readonly<AuthLayoutProps>) {
  const { isKeyboardVisible } = useMobileKeyboard();
  const formRef = useRef<HTMLElement>(null);
  const isSplitVariant = layoutVariant === 'split';

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
    <div
      data-auth-shell
      data-auth-layout-variant={layoutVariant}
      className={cn(
        // Fixed positioning prevents iOS Safari rubber-band overscroll completely
        // max-w-[100dvw] prevents any content from causing horizontal scroll on mobile
        'fixed inset-0 isolate flex flex-col items-center overflow-y-auto overflow-x-clip overscroll-none max-w-[100dvw] bg-[#08090a] text-white [color-scheme:dark]',
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
        <div className='auth-shell-grain absolute inset-0 opacity-[0.12]' />
        <div className='absolute left-[12%] top-[14%] h-[18rem] w-[18rem] rounded-full bg-white/[0.04] blur-[110px]' />
        <div className='absolute right-[10%] top-[8%] h-[28rem] w-[28rem] rounded-full bg-accent/10 blur-[180px]' />
        <div
          className='absolute inset-0'
          style={{
            background:
              'linear-gradient(180deg, rgba(255,255,255,0.02), transparent 20%, transparent 72%, rgba(0,0,0,0.22))',
          }}
        />
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

      {isSplitVariant ? (
        <div className='relative z-10 flex w-full max-w-[1280px] flex-1 items-center justify-center'>
          <div className='grid w-full gap-8 lg:min-h-[calc(100svh-8rem)] lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)] lg:items-stretch lg:gap-10 xl:gap-14'>
            <div className='flex min-h-0 flex-col justify-center lg:max-w-[520px] lg:py-8'>
              {showLogo ? (
                <div
                  className={cn(
                    'mb-7 flex justify-center transition-opacity duration-200 ease-out lg:mb-8 lg:justify-start',
                    isKeyboardVisible && 'opacity-0 pointer-events-none'
                  )}
                  aria-hidden={isKeyboardVisible}
                >
                  <Link
                    href='/'
                    className='inline-flex items-center justify-center text-white/92 transition-colors duration-200 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20'
                    aria-label='Go to homepage'
                    tabIndex={isKeyboardVisible ? -1 : undefined}
                  >
                    <BrandLogo size={20} tone='white' aria-hidden />
                  </Link>
                </div>
              ) : null}

              {showFormTitle && formTitle ? (
                <h1
                  className={cn(
                    formTitleClassName,
                    'mb-8 transition-all duration-200 ease-out text-center lg:text-left',
                    isKeyboardVisible && 'opacity-0 h-0 mb-0 overflow-hidden'
                  )}
                  aria-hidden={isKeyboardVisible}
                >
                  {formTitle}
                </h1>
              ) : null}

              <main
                ref={formRef}
                id='auth-form'
                tabIndex={-1}
                className='w-full scroll-mt-4'
              >
                <div className='mx-auto w-full max-w-[520px] lg:mx-0'>
                  {children}
                </div>
              </main>

              {showFooterPrompt && !isKeyboardVisible ? (
                <p className='mt-7 text-center text-[13px] font-[400] text-white/58 animate-in fade-in-0 duration-200 lg:text-left'>
                  {footerPrompt}{' '}
                  <Link
                    href={footerLinkHref}
                    className={`text-white underline ${LINK_FOCUS_CLASSES}`}
                  >
                    {footerLinkText}
                  </Link>
                </p>
              ) : null}
            </div>

            {showLogo ? (
              <div className='auth-desktop-only w-full lg:flex lg:min-h-full lg:justify-self-end'>
                <AuthBrandPanel className='ml-auto h-full w-full max-w-[640px]' />
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
