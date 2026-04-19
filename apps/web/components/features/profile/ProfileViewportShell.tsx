import { ImageWithFallback } from '@/components/atoms/ImageWithFallback';

interface ProfileViewportShellProps {
  readonly ambientImageUrl?: string | null;
  readonly artistName: string;
  readonly header: React.ReactNode;
  readonly children: React.ReactNode;
}

export function ProfileViewportShell({
  ambientImageUrl,
  artistName,
  header,
  children,
}: ProfileViewportShellProps) {
  return (
    <div className='relative min-h-[100dvh] overflow-hidden bg-[color:var(--profile-stage-bg)] text-primary-token'>
      <div className='absolute inset-0' aria-hidden='true'>
        <div className='absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_26%),radial-gradient(circle_at_20%_16%,rgba(255,255,255,0.05),transparent_28%),linear-gradient(180deg,rgba(6,8,13,0.34)_0%,rgba(7,8,10,0.82)_42%,rgba(8,9,10,0.98)_100%)]' />
        <div className='absolute inset-[-10%]'>
          <ImageWithFallback
            src={ambientImageUrl}
            alt={`${artistName} background`}
            fill
            sizes='(max-width: 767px) 100vw, 680px'
            className='scale-[1.05] object-cover opacity-28 blur-[84px] saturate-[0.88]'
            fallbackVariant='avatar'
            fallbackClassName='bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_48%)]'
          />
        </div>
      </div>

      <div className='relative mx-auto flex min-h-[100dvh] w-full max-w-[680px] items-stretch justify-center md:px-6 md:py-8'>
        <main className='relative flex w-full items-stretch'>
          <div
            className='relative flex min-h-[100dvh] w-full flex-col overflow-hidden bg-[color:var(--profile-content-bg)] md:min-h-[min(920px,calc(100dvh-64px))] md:rounded-[var(--profile-shell-card-radius)] md:border md:border-[color:var(--profile-panel-border)] md:shadow-[var(--profile-panel-shadow)]'
            data-testid='profile-viewport-shell'
          >
            <div className='pointer-events-none absolute inset-0 bg-[var(--profile-panel-gradient)]' />
            <div className='relative z-10'>{header}</div>
            <div className='relative z-10 flex min-h-0 flex-1 flex-col'>
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
