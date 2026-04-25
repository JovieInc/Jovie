import Link from 'next/link';
import { APP_ROUTES } from '@/constants/routes';

export function HomeLegalFooter() {
  return (
    <footer className='homepage-legal-footer flex flex-col items-center justify-between gap-3 px-5 py-4 text-[11px] text-white/56 sm:flex-row sm:px-6 sm:py-5'>
      <span>© {new Date().getFullYear()} Jovie Technology Inc.</span>
      <nav aria-label='Legal' className='flex items-center gap-4'>
        <Link
          href={APP_ROUTES.LEGAL_TERMS}
          className='focus-ring-themed rounded transition-colors duration-150 hover:text-white/64 focus-visible:text-white/64'
        >
          Terms
        </Link>
        <Link
          href={APP_ROUTES.LEGAL_PRIVACY}
          className='focus-ring-themed rounded transition-colors duration-150 hover:text-white/64 focus-visible:text-white/64'
        >
          Privacy
        </Link>
        <a
          href='https://status.jov.ie'
          className='focus-ring-themed rounded transition-colors duration-150 hover:text-white/64 focus-visible:text-white/64'
        >
          Status
        </a>
      </nav>
    </footer>
  );
}
