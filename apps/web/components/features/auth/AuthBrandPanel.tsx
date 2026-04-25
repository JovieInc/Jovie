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
        <div className='auth-showcase-copy'>
          <h2 className='text-[clamp(2.2rem,3vw,3rem)] leading-[0.95] font-[600] tracking-[-0.06em] whitespace-nowrap text-white'>
            Built for Artists.
          </h2>
        </div>
      ) : null}

      <div className='auth-showcase-frame w-full' aria-hidden='true' />

      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/[0.04]'
      />
    </div>
  );
}
