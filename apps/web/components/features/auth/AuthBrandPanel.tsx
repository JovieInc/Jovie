import { cn } from '@/lib/utils';

interface AuthBrandPanelProps {
  readonly className?: string;
  readonly variant?: 'page' | 'image-only';
}

export function AuthBrandPanel({
  className,
  variant = 'page',
}: Readonly<AuthBrandPanelProps>) {
  const showCopy = variant === 'page';

  return (
    <div
      className={cn(
        'auth-showcase-panel flex h-full flex-col',
        'min-h-[42rem] lg:min-h-[calc(100svh-7.5rem)]',
        className
      )}
      data-variant={variant}
    >
      {showCopy ? (
        <div className='auth-showcase-copy space-y-3'>
          <h2 className='text-[clamp(2.15rem,2.95vw,2.9rem)] leading-[0.95] font-[600] tracking-[-0.055em] whitespace-nowrap text-white'>
            Built for Artists.
          </h2>
          <p className='max-w-[16rem] text-[0.92rem] leading-[1.58] font-[420] text-white/54 text-pretty'>
            Jovie keeps releases, profiles, and the audience behind them in one
            calm system.
          </p>
        </div>
      ) : null}

      <div className='auth-showcase-frame w-full'>
        <div className='auth-showcase-story'>
          <div className='space-y-3'>
            <p className='auth-showcase-kicker'>Release cleanly.</p>
            <p className='auth-showcase-body'>
              Keep every link, profile, and announcement aligned from one quiet
              workspace.
            </p>
          </div>

          <div className='space-y-3 border-t border-white/[0.08] pt-6'>
            <p className='auth-showcase-kicker'>Keep momentum warm.</p>
            <p className='auth-showcase-body'>
              Stay ready for the next drop without rebuilding the whole system
              each time.
            </p>
          </div>
        </div>
      </div>

      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/[0.04]'
      />
    </div>
  );
}
