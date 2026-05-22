'use client';

import { ProductScreenshotFrame } from '@/components/marketing/ProductScreenshotFrame';
import { cn } from '@/lib/utils';

interface AuthBrandPanelProps {
  readonly className?: string;
}

const AUTH_BRAND_FRAME = 'shell-v1-releases-desktop';

export function AuthBrandPanel({ className }: Readonly<AuthBrandPanelProps>) {
  return (
    <div
      data-testid='auth-brand-panel'
      className={cn(
        // App-shell content surface elevation (matches `--linear-bg-surface-0`
        // = `--linear-app-content-surface` in Linear dark mode). 12px radius
        // matches the app shell frame so this reads as an extension of the
        // shell. Hex-pinned because auth is dark regardless of root theme.
        'auth-showcase-panel relative flex h-full min-h-[34rem] flex-col overflow-hidden rounded-[12px] bg-[#0a0b0e] text-white',
        'border border-white/[0.05]',
        'lg:min-h-[calc(100svh-1rem)]',
        className
      )}
    >
      <AuthBrandFrame />
    </div>
  );
}

function AuthBrandFrame() {
  return (
    <section
      aria-label='Product preview'
      className='absolute inset-0 flex flex-col'
    >
      {/* Spacer above the floating screenshot. */}
      <div className='min-h-0 flex-1' />

      {/* Stage with reserved 16:10 space so the static preview never shifts. */}
      <div className='relative mx-8 aspect-[16/10] sm:mx-10'>
        <ProductScreenshotFrame
          scenarioId={AUTH_BRAND_FRAME}
          sizes='(min-width: 1280px) 540px, (min-width: 1024px) 44vw, 88vw'
          priority
          fill
        />
      </div>

      {/* Spacer pushes the headline + bars to the bottom of the card. */}
      <div className='min-h-0 flex-1' />

      <div className='relative z-10 px-8 pb-4 sm:px-10'>
        <h2 className='text-balance text-[clamp(1.5rem,2.6vw,2rem)] font-[680] leading-[1.05] tracking-[-0.025em] text-white'>
          Built for Artists.
        </h2>
      </div>
    </section>
  );
}
