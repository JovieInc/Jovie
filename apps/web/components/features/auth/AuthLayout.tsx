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
import { type ReactNode, useRef } from 'react';
import { AppIconButton } from '@/components/atoms/AppIconButton';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { APP_ROUTES } from '@/constants/routes';
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
    <div className='relative z-10 flex w-full flex-1 items-stretch justify-center'>
      {/* max-w constrains the split layout on ultra-wide displays so the form
          column doesn't strand at the left with an enormous dead-space right panel */}
      <div className='grid w-full max-w-[1440px] gap-2 lg:grid-cols-[minmax(0,480px)_minmax(0,1fr)] lg:items-stretch'>
        <div className='flex min-h-0 flex-col items-center justify-center px-4 sm:px-8 lg:max-w-[480px] lg:px-10'>
          {showFormTitle && formTitle ? (
            <h1
              className={cn(
                formTitleClassName,
                'mb-6 text-center transition-[margin,height,opacity] duration-subtle ease-subtle',
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
            <div className='mx-auto w-full max-w-[420px]'>{children}</div>
          </main>

          {showFooterPrompt && !isKeyboardVisible ? (
            <p className='mt-3 text-center text-app font-normal text-white/58 animate-in fade-in-0 duration-subtle'>
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
          <div className='auth-desktop-only h-full w-full lg:flex lg:min-h-full'>
            <AuthBrandPanel className='h-full w-full' />
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
              'transition-[margin,height,opacity] duration-subtle ease-subtle',
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
        <p className='relative z-10 mt-auto pt-8 text-center text-app font-normal text-[lch(68%_1.35_282)] animate-in fade-in-0 duration-subtle'>
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
  footerPrompt = 'No account?',
  footerLinkText = 'Request access',
  footerLinkHref = APP_ROUTES.SIGNUP,
  showFooterPrompt = false,
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

  // No scrollIntoView keyboard pull-up: the shell is overflow-hidden
  // (no scrollable ancestor), and the layout is sized to fit at every
  // standard breakpoint without scroll.

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
        // App-shell base — sidebar/page background tone (matches Linear
        // dark `--linear-bg-page`). The bento card sits inside as the
        // elevated content surface with an 8px gap (matches the app
        // shell's frame-shell-gap), so this surface reads as an
        // extension of the shell, not a separate page. Hex-pinned
        // because auth is dark regardless of root theme preference.
        'fixed inset-0 isolate flex flex-col items-center overflow-hidden overscroll-none max-w-[100dvw] text-white [color-scheme:dark]',
        'bg-[#06070a]',
        'p-2 sm:p-2',
        isKeyboardVisible && 'pt-1 pb-1',
        'pb-[max(0.5rem,env(safe-area-inset-bottom))]',
        'pl-[max(0.5rem,env(safe-area-inset-left))]',
        'pr-[max(0.5rem,env(safe-area-inset-right))]',
        'transition-[padding] duration-subtle ease-subtle'
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
            'absolute top-5 left-5 z-50 transition-opacity duration-subtle ease-subtle sm:top-6 sm:left-7 lg:top-7 lg:left-14',
            isKeyboardVisible && 'pointer-events-none opacity-0'
          )}
          aria-hidden={isKeyboardVisible}
        >
          <Link
            href='/'
            className='inline-flex items-center justify-center text-white/45 transition-colors duration-subtle hover:text-white/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20'
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
