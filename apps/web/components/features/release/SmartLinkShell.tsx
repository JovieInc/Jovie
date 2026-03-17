import Link from 'next/link';
import type { ReactNode } from 'react';

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
    <div className='bg-base text-foreground min-h-screen'>
      {/* Ambient glow background */}
      <div className='pointer-events-none fixed inset-0'>
        <div className='bg-foreground/5 absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl' />
      </div>

      <main className='relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-8'>
        <div className='w-full max-w-md space-y-5'>{children}</div>

        {/* Jovie Branding */}
        <footer className='pt-6 text-center'>
          <Link
            href='/'
            className='text-muted-foreground/70 hover:text-foreground/90 inline-flex items-center gap-1.5 text-2xs transition-colors'
          >
            <span>Powered by</span>
            <span className='font-medium'>Jovie</span>
          </Link>
        </footer>
      </main>
    </div>
  );
}
