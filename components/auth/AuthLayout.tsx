import Link from 'next/link';
import type { ReactNode } from 'react';
import { LogoIcon } from '@/components/atoms/LogoIcon';

interface AuthLayoutProps {
  children: ReactNode;
  formTitle: string;
  footerPrompt?: string;
  footerLinkText?: string;
  footerLinkHref?: string;
  /** @deprecated No longer used in single-column layout */
  brandingTitle?: string;
  /** @deprecated No longer used in single-column layout */
  brandingDescription?: string;
  /** @deprecated No longer used in single-column layout */
  gradientVariant?: string;
  /** @deprecated No longer used in single-column layout */
  textColorClass?: string;
  /** @deprecated No longer used in single-column layout */
  brandingShowText?: boolean;
}

export function AuthLayout({
  children,
  formTitle,
  footerPrompt = "Don't have access?",
  footerLinkText = 'Join the waitlist',
  footerLinkHref = '/waitlist',
}: AuthLayoutProps) {
  return (
    <div className='min-h-screen flex flex-col items-center justify-center bg-[#101012] px-4'>
      {/* Logo */}
      <div className='mb-6'>
        <LogoIcon size={56} variant='white' />
      </div>

      {/* Title */}
      <h1 className='text-lg font-medium text-[rgb(227,228,230)] mb-10'>
        {formTitle}
      </h1>

      {/* Form content */}
      <div className='w-full max-w-sm'>{children}</div>

      {/* Footer */}
      <p className='mt-10 text-sm text-[#6b6f76]'>
        {footerPrompt}{' '}
        <Link href={footerLinkHref} className='text-white hover:underline'>
          {footerLinkText}
        </Link>
      </p>

      {/* Legal links */}
      <div className='absolute bottom-4 flex gap-4 text-xs text-[#666]'>
        <Link
          href='/legal/terms'
          className='hover:text-white transition-colors no-underline'
        >
          Terms
        </Link>
        <Link
          href='/legal/privacy'
          className='hover:text-white transition-colors no-underline'
        >
          Privacy Policy
        </Link>
      </div>
    </div>
  );
}
