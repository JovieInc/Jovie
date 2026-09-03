'use client';

// @coverage-via apps/web/tests/unit/auth/AuthBrandPanel.test.tsx
import Image from 'next/image';
import { ProductScreenshotFrame } from '@/components/marketing/ProductScreenshotFrame';
import { cn } from '@/lib/utils';

interface AuthBrandPanelProps {
  readonly className?: string;
  readonly headline?: string;
  readonly description?: string;
  readonly showText?: boolean;
}

const AUTH_BRAND_FRAME = 'dashboard-releases-sidebar-desktop';
const DEFAULT_AUTH_BRAND_HEADLINE = 'Built For Artists.';

export function AuthBrandPanel({
  className,
  headline = DEFAULT_AUTH_BRAND_HEADLINE,
  description,
  showText = true,
}: Readonly<AuthBrandPanelProps>) {
  return (
    <div
      data-testid='auth-brand-panel'
      className={cn(
        // App-shell content surface elevation (matches `--linear-bg-surface-0`
        // = `--app-shell-content-surface` in Linear dark mode). 12px radius
        // matches the app shell frame so this reads as an extension of the
        // shell. Tooltip tokens stay dark in both root themes because auth
        // is dark regardless of root theme.
        'auth-showcase-panel relative flex h-full min-h-[34rem] flex-col overflow-hidden rounded-xl bg-(--color-bg-tooltip) text-(--color-text-tooltip)',
        'border border-white/[0.05]',
        'lg:min-h-[calc(100svh-1rem)]',
        className
      )}
    >
      <AuthBrandFrame
        headline={headline}
        description={description}
        showText={showText}
      />
    </div>
  );
}

function AuthBrandFrame({
  headline,
  description,
  showText,
}: Readonly<{
  headline: string;
  description?: string;
  showText: boolean;
}>) {
  return (
    <section
      aria-label='Product Preview'
      className='absolute inset-0 flex flex-col'
    >
      <div aria-hidden='true' className='absolute inset-0 overflow-hidden'>
        <Image
          src='/images/auth/noir-studio.webp'
          alt=''
          fill
          priority
          sizes='(min-width: 1024px) 50vw, 0vw'
          className='object-cover object-right opacity-55 forced-colors:hidden'
        />
        <div className='absolute inset-0 bg-gradient-to-r from-(--color-bg-tooltip) via-(--color-bg-tooltip)/78 to-(--color-bg-tooltip)/20' />
        <div className='absolute inset-0 bg-gradient-to-t from-(--color-bg-tooltip) via-transparent to-(--color-bg-tooltip)/28' />
      </div>

      {/* Spacer above the floating screenshot. */}
      <div className='relative min-h-0 flex-1' />

      {/* Stage with reserved 16:10 space so the static preview never shifts. */}
      <div className='relative z-10 mx-8 aspect-[16/10] sm:mx-10'>
        <ProductScreenshotFrame
          scenarioId={AUTH_BRAND_FRAME}
          sizes='(min-width: 1280px) 540px, (min-width: 1024px) 44vw, 88vw'
          priority
          fill
          className='border-white/[0.12] bg-(--color-bg-base)'
        />
      </div>

      {/* Spacer pushes the headline + bars to the bottom of the card. */}
      <div className='relative min-h-0 flex-1' />

      {showText ? (
        <div className='relative z-10 px-8 pb-4 sm:px-10'>
          <h2 className='text-balance text-[clamp(1.5rem,2.6vw,2rem)] font-bold leading-[1.05] tracking-[-0.025em] text-(--color-text-tooltip)'>
            {headline}
          </h2>
          {description ? (
            <p className='mt-3 max-w-96 text-pretty text-app leading-6 text-(--color-text-tooltip)/70'>
              {description}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
