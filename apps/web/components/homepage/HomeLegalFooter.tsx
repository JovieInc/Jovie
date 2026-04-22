import Link from 'next/link';
import { APP_ROUTES } from '@/constants/routes';

export function HomeLegalFooter() {
  return (
    <footer className='flex items-center justify-between px-6 py-3 text-[11px] text-quaternary-token'>
      <span>© {new Date().getFullYear()} Jovie Technology Inc.</span>
      <nav aria-label='Legal' className='flex items-center gap-4'>
        <Link
          href={APP_ROUTES.LEGAL_TERMS}
          className='transition-colors duration-150 hover:text-secondary-token'
        >
          Terms
        </Link>
        <Link
          href={APP_ROUTES.LEGAL_PRIVACY}
          className='transition-colors duration-150 hover:text-secondary-token'
        >
          Privacy
        </Link>
        <a
          href='https://status.jov.ie'
          className='transition-colors duration-150 hover:text-secondary-token'
        >
          Status
        </a>
      </nav>
    </footer>
  );
}
