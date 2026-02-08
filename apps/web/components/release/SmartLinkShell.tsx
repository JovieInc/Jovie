import type { ReactNode } from 'react';
import Link from 'next/link';

interface SmartLinkShellProps {
  readonly children: ReactNode;
}

/**
 * Shared layout shell for smart link pages (released and unreleased).
 * Provides dark background, ambient glow, centered container, and Jovie footer.
 * Container uses max-w-md to match the profile page layout width.
 */
export function SmartLinkShell({ children }: SmartLinkShellProps) {
  return (
    <div className='min-h-screen bg-black text-white'>
      {/* Ambient glow background */}
      <div className='pointer-events-none fixed inset-0'>
        <div className='absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/3 blur-3xl' />
      </div>

      <main className='relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-8'>
        <div className='w-full max-w-md space-y-5'>
          {children}
        </div>

        {/* Jovie Branding */}
        <footer className='pt-6 text-center'>
          <Link
            href='/'
            className='inline-flex items-center gap-1.5 text-[11px] text-white/25 transition-colors hover:text-white/40'
          >
            <span>Powered by</span>
            <span className='font-medium'>Jovie</span>
          </Link>
        </footer>
      </main>
    </div>
  );
}
