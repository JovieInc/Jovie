import { cn } from '@/lib/utils';

interface AuthBrandPanelProps {
  readonly className?: string;
  readonly variant?: 'page' | 'image-only' | 'v1';
}

export function AuthBrandPanel({
  className,
  variant = 'page',
}: Readonly<AuthBrandPanelProps>) {
  const showCopy = variant === 'page';

  if (variant === 'v1') {
    return (
      <div
        className={cn(
          'relative flex h-full min-h-[42rem] flex-col overflow-hidden rounded-[28px] border border-white/[0.07] bg-[#0a0c0f]',
          'lg:min-h-[calc(100svh-7.5rem)]',
          className
        )}
        data-variant={variant}
      >
        <div
          aria-hidden='true'
          className='absolute inset-0 bg-[radial-gradient(circle_at_52%_18%,rgba(103,232,249,0.14),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.035),transparent_28%,rgba(0,0,0,0.28))]'
        />
        <div className='relative z-10 flex flex-1 flex-col p-7'>
          <div className='flex items-center justify-between border-b border-white/[0.07] pb-5'>
            <div>
              <p className='text-[13px] font-semibold text-white'>
                Artist Workspace
              </p>
              <p className='mt-1 text-[12px] text-white/42'>
                Release queue and profile prep
              </p>
            </div>
            <div className='flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-[12px] font-semibold text-white/72'>
              J
            </div>
          </div>

          <div className='mt-8 space-y-3'>
            {[
              ['Profile', 'Claim handle and publish listener links'],
              ['Release', 'Prepare assets, destinations, and pitch notes'],
              ['Audience', 'Capture subscribers before launch day'],
            ].map(([label, body], index) => (
              <div
                key={label}
                className='rounded-[18px] border border-white/[0.07] bg-white/[0.035] p-4'
              >
                <div className='flex items-center justify-between gap-4'>
                  <div className='min-w-0'>
                    <p className='text-[13px] font-semibold text-white'>
                      {label}
                    </p>
                    <p className='mt-1 text-[12px] leading-5 text-white/46'>
                      {body}
                    </p>
                  </div>
                  <div className='h-2 w-16 rounded-full bg-white/[0.08]'>
                    <div
                      className='h-full rounded-full bg-cyan-200/70'
                      style={{ width: `${48 + index * 18}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className='mt-auto rounded-[22px] border border-cyan-200/10 bg-cyan-200/[0.035] p-5'>
            <p className='text-[13px] font-semibold text-white'>
              Jovie is ready when you are.
            </p>
            <p className='mt-2 text-[12px] leading-5 text-white/48'>
              Sign in to continue release planning, profile setup, and audience
              capture from one place.
            </p>
          </div>
        </div>
      </div>
    );
  }

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
