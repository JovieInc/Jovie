import Link from 'next/link';
import { CommandPalettePanel } from '@/components/features/commands/CommandPalettePanel';
import { MarketingPageShell } from '@/components/marketing/MarketingPageShell';
import { COMMAND_PALETTE_COPY } from '@/data/commandPaletteCopy';
import './CommandPaletteLanding.css';

export function CommandPaletteLanding() {
  const { headline, support, links } = COMMAND_PALETTE_COPY;

  return (
    <MarketingPageShell className='bg-base text-primary-token'>
      <section
        aria-labelledby='command-palette-title'
        className='command-palette-stage relative flex flex-col overflow-hidden'
        data-accent='ion'
        data-marketing-owner='apps/web/app/(marketing)/product/command-palette/CommandPaletteLanding.tsx'
        data-marketing-variant='split-screenshot-right'
        data-testid='marketing-section-hero'
      >
        <div
          aria-hidden='true'
          className='hero-glow command-palette-glow pointer-events-none absolute inset-x-0 top-0'
        />
        <div className='relative w-full max-w-3xl px-6 pt-16 sm:px-10 sm:pt-24'>
          <h1
            className='text-balance font-display text-2xl font-medium tracking-tight text-primary-token'
            data-wrap='editorial-title'
            id='command-palette-title'
          >
            {headline}
          </h1>
          <p className='mt-4 max-w-xl text-base leading-7 text-secondary-token'>
            {support}
          </p>
          <div className='mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm'>
            {links.map(link => (
              <Link
                className='text-secondary-token'
                href={link.href}
                key={link.href}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
        <div className='relative mt-16 flex w-full max-w-xl flex-1 items-end px-6 sm:px-10'>
          <div
            className='command-palette-card w-full rounded-3xl border border-subtle bg-surface-1'
            data-testid='command-palette-panel'
          >
            <CommandPalettePanel />
          </div>
        </div>
      </section>
    </MarketingPageShell>
  );
}
