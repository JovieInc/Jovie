import Link from 'next/link';
import type { ReactNode } from 'react';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { AUTH_FORM_MAX_WIDTH_CLASS } from '@/features/auth/constants';
import { cn } from '@/lib/utils';

interface PublicAuthLayoutProps {
  readonly children: ReactNode;
  readonly footerPrompt: string;
  readonly footerLinkText: string;
  readonly footerLinkHref: string;
  readonly showSkipLink?: boolean;
}

const LINK_FOCUS_CLASSES = 'focus-ring-themed rounded-md';

export function PublicAuthLayout({
  children,
  footerPrompt,
  footerLinkText,
  footerLinkHref,
  showSkipLink = true,
}: PublicAuthLayoutProps) {
  return (
    <div
      className={cn(
        'min-h-dvh flex flex-col items-center bg-page text-primary-token overflow-x-clip',
        'px-4 sm:px-6',
        'pt-[18vh] sm:pt-[20vh] pb-12',
        'pb-[max(1.5rem,env(safe-area-inset-bottom))]',
        'pl-[max(1rem,env(safe-area-inset-left))]',
        'pr-[max(1rem,env(safe-area-inset-right))]'
      )}
    >
      {showSkipLink && (
        <Link
          href='#auth-form'
          className='sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:rounded-md focus:bg-surface-1 focus:text-primary-token focus:border focus:border-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0'
        >
          Skip to form
        </Link>
      )}

      <div className='mb-8 h-8 w-8 flex items-center justify-center'>
        <Link
          href='/'
          className={`block ${LINK_FOCUS_CLASSES}`}
          aria-label='Go to homepage'
        >
          <span className='inline-flex'>
            <BrandLogo size={32} tone='auto' />
          </span>
        </Link>
      </div>

      <div
        id='auth-form'
        className={cn(
          `w-full ${AUTH_FORM_MAX_WIDTH_CLASS} relative z-10`,
          'scroll-mt-4',
          'overflow-visible'
        )}
      >
        {children}
      </div>

      <p className='mt-auto pt-8 text-[13px] font-[400] text-tertiary-token text-center relative z-10'>
        {footerPrompt}{' '}
        <Link
          href={footerLinkHref}
          className={`inline-flex min-h-6 items-center px-1 py-1 text-primary-token underline ${LINK_FOCUS_CLASSES}`}
        >
          {footerLinkText}
        </Link>
      </p>
    </div>
  );
}
