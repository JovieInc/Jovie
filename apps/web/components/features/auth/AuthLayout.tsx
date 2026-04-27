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
  /** Accepted for API compatibility; not used in this layout. */
  readonly logoSpinDelayMs?: number;
  readonly showSkipLink?: boolean;
  readonly showLogo?: boolean;
  readonly showLogoutButton?: boolean;
  readonly logoutRedirectUrl?: string;
  readonly layoutVariant?: 'stack' | 'split';
  readonly showcaseVariant?: 'page' | 'image-only';
}

const LINK_FOCUS_CLASSES = 'focus-ring-themed rounded-md';

interface AuthLayoutInnerProps {
  readonly children: ReactNode;
  readonly formTitle: string;
  readonly formTitleClassName: string;
  readonly footerPrompt: string;
  readonly footerLinkText: string;
  readonly footerLinkHref: string;
  readonly showFooterPrompt: boolean;
  readonly showFormTitle: boolean;
  readonly showLogo: boolean;
  readonly showcaseVariant: 'page' | 'image-only';
  readonly isKeyboardVisible: boolean;
  readonly formRef: React.RefObject<HTMLElement | null>;
}

function SplitLayoutContent({
  children,
  formTitle,
  formTitleClassName,
  footerPrompt,
  footerLinkText,
  footerLinkHref,
  showFooterPrompt,
  showFormTitle,
  showLogo,
  showcaseVariant,
  isKeyboardVisible,
  formRef,
}: AuthLayoutInnerProps) {
  return (
    <div className='relative z-10 flex w-full max-w-[1240px] flex-1 items-center justify-center'>
      <div className='grid w-full gap-6 lg:min-h-[calc(100svh-7.5rem)] lg:grid-cols-[minmax(0,500px)_minmax(0,1fr)] lg:items-stretch lg:gap-7 xl:gap-10'>
        <div className='flex min-h-0 flex-col justify-center lg:max-w-[500px] lg:justify-start lg:pt-16 lg:pb-6 xl:pt-20'>
          {showLogo ? (
            <div
              className={cn(
                'mb-5 flex justify-center transition-opacity duration-200 ease-out lg:mb-6 lg:justify-start',
                isKeyboardVisible && 'pointer-events-none opacity-0'
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
                'mb-8 text-center transition-all duration-200 ease-out lg:text-left',
                isKeyboardVisible && 'mb-0 h-0 overflow-hidden opacity-0'
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
            <div className='mx-auto w-full max-w-[500px] lg:mx-0'>
              {children}
            </div>
          </main>

          {showFooterPrompt && !isKeyboardVisible ? (
            <p className='mt-6 text-center text-app font-normal text-white/58 animate-in fade-in-0 duration-200 lg:text-left'>
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
            <AuthBrandPanel
              variant={showcaseVariant}
              className='ml-auto h-full w-full max-w-[620px]'
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StackLayoutContent({
  children,
  formTitle,
  formTitleClassName,
  footerPrompt,
  footerLinkText,
  footerLinkHref,
  showFooterPrompt,
  showFormTitle,
  showLogo,
  isKeyboardVisible,
  formRef,
}: Omit<AuthLayoutInnerProps, 'showcaseVariant'>) {
  return (
    <>
      <div
        className={cn(
          `relative z-10 flex w-full ${AUTH_FORM_MAX_WIDTH_CLASS} flex-col items-center overflow-visible`
        )}
      >
        <div
          className={cn(
            'mb-6 flex h-6 w-6 items-center justify-center sm:mb-8',
            'transition-opacity duration-200 ease-out',
            (isKeyboardVisible || !showLogo) && 'pointer-events-none opacity-0'
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

        {showFormTitle && formTitle ? (
          <h1
            className={cn(
              formTitleClassName,
              'transition-all duration-200 ease-out',
              isKeyboardVisible && 'mb-0 h-0 overflow-hidden opacity-0'
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
          {children}
        </main>
      </div>

      {showFooterPrompt && !isKeyboardVisible ? (
        <p className='relative z-10 mt-auto pt-8 text-center text-app font-normal text-[lch(68%_1.35_282)] animate-in fade-in-0 duration-200'>
          {footerPrompt}{' '}
          <Link
            href={footerLinkHref}
            className={`text-white underline ${LINK_FOCUS_CLASSES}`}
          >
            {footerLinkText}
          </Link>
        </p>
      ) : null}
    </>
  );
}

export function AuthLayout({
  children,
  formTitle,
  formTitleClassName = 'text-[18px] leading-[22px] font-medium text-primary-token text-center',
  footerPrompt = "Don't have access?",
  footerLinkText = 'Join the waitlist',
  footerLinkHref = '/waitlist',
  showFooterPrompt = true,
  showFormTitle = true,
  logoSpinDelayMs: _logoSpinDelayMs,
  showSkipLink = true,
  showLogo = true,
  showLogoutButton = false,
  logoutRedirectUrl = '/signin',
  layoutVariant = 'stack',
  showcaseVariant = 'page',
}: Readonly<AuthLayoutProps>) {
  const { isKeyboardVisible } = useMobileKeyboard();
  const formRef = useRef<HTMLElement>(null);
  const isSplitVariant = layoutVariant === 'split';

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

  const innerProps: AuthLayoutInnerProps = {
    children,
    formTitle,
    formTitleClassName,
    footerPrompt,
    footerLinkText,
    footerLinkHref,
    showFooterPrompt,
    showFormTitle,
    showLogo,
    showcaseVariant,
    isKeyboardVisible,
    formRef,
  };

  return (
    <div
      data-auth-shell
      data-auth-layout-variant={layoutVariant}
      className={cn(
        'fixed inset-0 isolate flex flex-col items-center overflow-y-auto overflow-x-clip overscroll-none max-w-[100dvw] bg-[#08090a] text-white [color-scheme:dark]',
        'px-4 sm:px-6',
        isKeyboardVisible
          ? 'pt-8 pb-4'
          : 'pt-10 pb-10 sm:pt-14 sm:pb-12 lg:pt-16',
        'pb-[max(1.5rem,env(safe-area-inset-bottom))]',
        'pl-[max(1rem,env(safe-area-inset-left))]',
        'pr-[max(1rem,env(safe-area-inset-right))]',
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

      {showSkipLink ? (
        <Link
          href='#auth-form'
          className='sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:border focus:border-subtle focus:bg-surface-1 focus:px-4 focus:py-2 focus:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0'
        >
          Skip to form
        </Link>
      ) : null}

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
        <SplitLayoutContent {...innerProps} />
      ) : (
        <StackLayoutContent {...innerProps} />
      )}
    </div>
  );
}
