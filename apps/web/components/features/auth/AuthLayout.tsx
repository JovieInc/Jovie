'use client';

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
import { useAuthSafe } from '@/hooks/useClerkSafe';
import { useMobileKeyboard } from '@/hooks/useMobileKeyboard';
import { AUTH_SHELL_KIND } from '@/lib/auth/auth-shell-layout-contract';
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
  readonly contentPlacement?: 'default' | 'center';
  readonly showcaseVariant?: 'page' | 'image-only';
  /** Splash B: tiny centered 32 cream mark on an empty field. */
  readonly chrome?: 'default' | 'splash-b';
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
  readonly contentPlacement: 'default' | 'center';
  readonly showcaseVariant: 'page' | 'image-only';
  readonly chrome: 'default' | 'splash-b';
  readonly isKeyboardVisible: boolean;
  readonly formRef: React.RefObject<HTMLElement | null>;
}

function AuthFormColumn({
  children,
  formTitle,
  formTitleClassName,
  footerPrompt,
  footerLinkText,
  footerLinkHref,
  showFooterPrompt,
  showFormTitle,
  showLogo,
  chrome,
  isKeyboardVisible,
  formRef,
  className,
}: AuthLayoutInnerProps & { readonly className?: string }) {
  const isSplashB = chrome === 'splash-b';

  return (
    <div
      className={cn(
        'relative flex min-h-0 flex-1 flex-col items-center justify-center px-4 sm:px-8',
        className
      )}
    >
      {showLogo && isSplashB && !isKeyboardVisible ? (
        <Link
          href={APP_ROUTES.HOME}
          className='mb-8 inline-flex size-11 shrink-0 items-center justify-center text-white dark:text-white transition-colors duration-subtle hover:text-white/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20'
          // ui-casing-allow: must match canonical sentence-case HOME_LINK_LABEL in useNormalizeClerkHomeLink
          aria-label='Go to homepage'
        >
          <BrandLogo size={32} tone='white' aria-hidden />
        </Link>
      ) : null}

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
        <div className='mx-auto w-full max-w-105'>{children}</div>
      </main>

      {showFooterPrompt && !isKeyboardVisible ? (
        <p className='mt-3 text-center text-app font-normal text-white/58 animate-in fade-in-0 duration-subtle'>
          {footerPrompt}{' '}
          <Link
            href={footerLinkHref}
            className={`text-white dark:text-white underline ${LINK_FOCUS_CLASSES}`}
          >
            {footerLinkText}
          </Link>
        </p>
      ) : null}
    </div>
  );
}

function SplitLayoutContent(props: AuthLayoutInnerProps) {
  return (
    <div className='relative z-10 flex w-full flex-1 items-stretch justify-center'>
      <div className='grid w-full max-w-360 gap-2 lg:grid-cols-[minmax(0,480px)_minmax(0,1fr)] lg:items-stretch'>
        <AuthFormColumn {...props} className='lg:max-w-120 lg:px-10' />

        {props.showLogo ? (
          <div
            className='auth-desktop-only h-full w-full lg:flex lg:min-h-full'
            data-auth-editorial-card='desktop-only'
          >
            <AuthBrandPanel className='h-full w-full' />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StackLayoutContent(props: AuthLayoutInnerProps) {
  return (
    <AuthFormColumn
      {...props}
      className={cn(
        AUTH_FORM_MAX_WIDTH_CLASS,
        props.contentPlacement === 'center' && 'flex-1'
      )}
    />
  );
}

export function AuthLayout({
  children,
  formTitle,
  formTitleClassName = 'text-lg leading-[22px] font-medium text-primary-token text-center',
  footerPrompt = 'No account?',
  footerLinkText = 'Create your account',
  footerLinkHref = APP_ROUTES.SIGNUP,
  showFooterPrompt = false,
  showFormTitle = true,
  logoSpinDelayMs: _logoSpinDelayMs,
  showSkipLink = true,
  showLogo = true,
  showLogoutButton = false,
  logoutRedirectUrl = APP_ROUTES.SIGNIN,
  layoutVariant = 'stack',
  contentPlacement = 'default',
  showcaseVariant = 'page',
  chrome = 'default',
}: Readonly<AuthLayoutProps>) {
  const { isKeyboardVisible } = useMobileKeyboard();
  const { signOut } = useAuthSafe();
  const formRef = useRef<HTMLElement>(null);
  const isSplashB = chrome === 'splash-b';
  const isSplitVariant = layoutVariant === 'split' && !isSplashB;

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
    contentPlacement: isSplashB ? 'center' : contentPlacement,
    showcaseVariant,
    chrome,
    isKeyboardVisible,
    formRef,
  };

  return (
    <div
      data-auth-shell
      data-auth-shell-kind={
        isSplitVariant
          ? AUTH_SHELL_KIND.desktopSplitRoute
          : AUTH_SHELL_KIND.stackRoute
      }
      data-auth-layout-variant={isSplitVariant ? 'split' : 'stack'}
      data-auth-chrome={chrome}
      className={cn(
        'fixed inset-0 isolate flex flex-col items-center overflow-hidden overscroll-none max-w-[100dvw] text-white dark:text-white [color-scheme:dark]',
        'bg-(--color-bg-base)',
        'p-2 sm:p-2',
        isKeyboardVisible && 'pt-1 pb-1',
        'pb-[max(0.5rem,env(safe-area-inset-bottom))]',
        'pl-[max(0.5rem,env(safe-area-inset-left))]',
        'pr-[max(0.5rem,env(safe-area-inset-right))]',
        'transition-[padding] duration-subtle ease-subtle'
      )}
    >
      {isSplashB ? null : (
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-0 overflow-hidden'
        >
          <div className='auth-shell-grain absolute inset-0 opacity-[0.12]' />
          <div
            className='absolute inset-0'
            style={{
              background:
                'linear-gradient(180deg, rgba(255,255,255,0.02), transparent 20%, transparent 72%, rgba(0,0,0,0.22))',
            }}
          />
        </div>
      )}

      {showSkipLink ? (
        <Link
          href='#auth-form'
          className='sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:border focus:border-subtle focus:bg-surface-1 focus:px-4 focus:py-2 focus:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0'
        >
          Skip to form
        </Link>
      ) : null}

      {showLogo && !isSplashB ? (
        <div
          className={cn(
            'absolute top-5 left-5 z-50 transition-opacity duration-subtle ease-subtle sm:top-6 sm:left-7 lg:top-7 lg:left-14',
            isKeyboardVisible && 'pointer-events-none opacity-0'
          )}
          aria-hidden={isKeyboardVisible}
        >
          <Link
            href={APP_ROUTES.HOME}
            className='inline-flex size-11 shrink-0 items-center justify-center text-white/45 dark:text-white/45 transition-colors duration-subtle hover:text-white/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20'
            // ui-casing-allow: must match canonical sentence-case HOME_LINK_LABEL in useNormalizeClerkHomeLink
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
              <AppIconButton ariaLabel='Open menu'>
                <MoreHorizontal />
              </AppIconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' sideOffset={8}>
              <DropdownMenuItem
                onSelect={() => {
                  void signOut({ redirectUrl: logoutRedirectUrl });
                }}
              >
                Log out
              </DropdownMenuItem>
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
