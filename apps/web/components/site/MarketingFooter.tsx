import Link from 'next/link';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { APP_ROUTES } from '@/constants/routes';

export function MarketingFooter() {
  return (
    <footer style={{ backgroundColor: 'var(--linear-bg-footer)' }}>
      <div
        aria-hidden='true'
        className='h-px'
        style={{
          background:
            'linear-gradient(to right, var(--linear-border-footer), var(--linear-border-footer) 40%, transparent)',
        }}
      />
      <div className='mx-auto flex w-full max-w-[var(--linear-content-max)] flex-col items-center gap-5 px-5 py-8 text-center sm:flex-row sm:justify-between sm:px-6 sm:text-left lg:px-0'>
        <Link
          href='/'
          className='inline-flex items-center gap-2 rounded-md p-1 -m-1 focus-ring-themed'
          aria-label='Jovie home'
        >
          <BrandLogo size={20} tone='auto' />
          <span
            className='text-[12px] font-medium tracking-[-0.01em]'
            style={{ color: 'var(--linear-text-tertiary)' }}
          >
            Jovie
          </span>
        </Link>
        <div className='flex items-center gap-4'>
          <Link
            href={APP_ROUTES.LEGAL_PRIVACY}
            className='text-[13px] tracking-[-0.01em] transition-colors duration-100 hover:[color:var(--linear-text-primary)]'
            style={{ color: 'var(--linear-text-tertiary)' }}
          >
            Privacy
          </Link>
          <Link
            href={APP_ROUTES.LEGAL_TERMS}
            className='text-[13px] tracking-[-0.01em] transition-colors duration-100 hover:[color:var(--linear-text-primary)]'
            style={{ color: 'var(--linear-text-tertiary)' }}
          >
            Terms
          </Link>
        </div>
      </div>
    </footer>
  );
}
