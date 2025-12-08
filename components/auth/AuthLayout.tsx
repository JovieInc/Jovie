import Link from 'next/link';
import type { ReactNode } from 'react';
import { LogoIcon } from '@/components/atoms/LogoIcon';

interface AuthLayoutProps {
  children: ReactNode;
  formTitle: string;
  footerPrompt?: string;
  footerLinkText?: string;
  footerLinkHref?: string;
}

const LINK_FOCUS_CLASSES =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#101012] rounded';

export function AuthLayout({
  children,
  formTitle,
  footerPrompt = "Don't have access?",
  footerLinkText = 'Join the waitlist',
  footerLinkHref = '/waitlist',
}: AuthLayoutProps) {
  return (
    <div className='min-h-screen flex flex-col items-center justify-center bg-[#101012] px-4'>
      {/* Skip to main content link for keyboard users */}
      <a
        href='#auth-form'
        className='sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-white focus:text-black focus:rounded-lg'
      >
        Skip to form
      </a>

      {/* Logo */}
      <div className='mb-6'>
        <Link
          href='/'
          className={`block ${LINK_FOCUS_CLASSES}`}
          aria-label='Go to homepage'
        >
          <LogoIcon size={56} variant='white' />
        </Link>
      </div>

      {/* Title */}
      <h1 className='text-lg font-medium text-[rgb(227,228,230)] mb-10'>
        {formTitle}
      </h1>

      {/* Form content */}
      <main id='auth-form' className='w-full max-w-sm' role='main'>
        {children}
      </main>

      {/* Footer */}
      <p className='mt-10 text-sm text-[#6b6f76]'>
        {footerPrompt}{' '}
        <Link
          href={footerLinkHref}
          className={`text-white hover:underline ${LINK_FOCUS_CLASSES}`}
        >
          {footerLinkText}
        </Link>
      </p>

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
    </div>
  );
}
