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
import { useAppFlag } from '@/lib/flags/client';
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
  readonly designV1: boolean;
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
  designV1,
}: AuthLayoutInnerProps) {
  return (
    <div
      className={cn(
        'relative z-10 flex w-full flex-1 items-center justify-center',
        designV1 ? 'max-w-[1160px]' : 'max-w-[1240px]'
      )}
    >
      <div className='grid w-full gap-4 lg:min-h-[calc(100svh-7.5rem)] lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:items-stretch lg:gap-6 xl:gap-8'>
        <div className='flex min-h-0 flex-col justify-center lg:max-w-[420px] lg:justify-start lg:pt-10 lg:pb-4 xl:pt-12'>
          {showFormTitle && formTitle ? (
            <h1
              className={cn(
                formTitleClassName,
                'mb-6 text-center transition-all duration-200 ease-out lg:text-left',
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
            <div className='mx-auto w-full max-w-[420px] lg:mx-0'>
              {children}
            </div>
          </main>

          {showFooterPrompt && !isKeyboardVisible ? (
            <p className='mt-5 text-center text-app font-normal text-white/58 animate-in fade-in-0 duration-200 lg:text-left'>
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
            <AuthBrandPanel className='ml-auto h-full w-full max-w-[620px]' />
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
  const designV1 = useAppFlag('DESIGN_V1');
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
    designV1,
  };

  return (
    <div
      data-auth-shell
      data-auth-layout-variant={layoutVariant}
      data-design-v1-auth={designV1 ? 'true' : 'false'}
      className={cn(
        'fixed inset-0 isolate flex flex-col items-center overflow-hidden overscroll-none max-w-[100dvw] text-white [color-scheme:dark]',
        designV1 ? 'bg-[#06070a]' : 'bg-[#08090a]',
        'px-4 sm:px-6',
        isKeyboardVisible ? 'pt-6 pb-2' : 'pt-8 pb-6 sm:pt-10 sm:pb-8 lg:pt-12',
        'pb-[max(1rem,env(safe-area-inset-bottom))]',
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
        {designV1 ? null : (
          <>
            <div className='absolute left-[12%] top-[14%] h-[18rem] w-[18rem] rounded-full bg-white/[0.04] blur-[110px]' />
            <div className='absolute right-[10%] top-[8%] h-[28rem] w-[28rem] rounded-full bg-accent/10 blur-[180px]' />
          </>
        )}
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

      {showLogo ? (
        <div
          className={cn(
            'absolute top-5 left-5 z-50 transition-opacity duration-200 ease-out sm:top-6 sm:left-6',
            isKeyboardVisible && 'pointer-events-none opacity-0'
          )}
          aria-hidden={isKeyboardVisible}
        >
          <Link
            href='/'
            className='inline-flex items-center justify-center text-white/45 transition-colors duration-200 hover:text-white/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20'
            aria-label='Go to homepage'
            tabIndex={isKeyboardVisible ? -1 : undefined}
          >
            <BrandLogo size={18} tone='auto' aria-hidden />
          </Link>
        </div>
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
