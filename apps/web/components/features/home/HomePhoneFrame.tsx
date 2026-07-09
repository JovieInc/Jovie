'use client';

import { cn } from '@/lib/utils';

interface HomePhoneFrameProps {
  readonly children: React.ReactNode;
  readonly compact?: boolean;
  readonly className?: string;
}

export function HomePhoneFrame({
  children,
  compact = false,
  className,
}: Readonly<HomePhoneFrameProps>) {
  return (
    <div
      className={cn(
        'homepage-phone-frame relative mx-auto flex w-full max-w-[min(100vw,var(--homepage-phone-frame-width))] shrink-0 items-center justify-center',
        compact
          ? '[--homepage-phone-frame-width:20rem] sm:[--homepage-phone-frame-width:20.25rem]'
          : '[--homepage-phone-frame-width:20.5rem]',
        className
      )}
    >
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-x-[10%] top-[4%] h-[18%] rounded-full bg-[radial-gradient(circle,rgba(176,197,255,0.18),rgba(176,197,255,0.05)_48%,transparent_76%)] blur-3xl'
      />

      <div className='homepage-phone-device relative w-full rounded-[2.65rem] p-2 shadow-[0_28px_84px_rgba(0,0,0,0.42)]'>
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-px rounded-[2.55rem] border border-white/12'
        />
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-1 rounded-[2.5rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.12),rgba(255,255,255,0.02)_14%,rgba(255,255,255,0.01)_86%,rgba(255,255,255,0.08))]'
        />
        <div
          aria-hidden='true'
          className='pointer-events-none absolute left-[11%] right-[11%] top-3 h-6 rounded-full bg-(--system-b-cinematic-black)'
        />
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-2 rounded-[2.3rem] bg-[linear-gradient(165deg,rgba(255,255,255,0.14),rgba(255,255,255,0)_22%)] opacity-90'
        />

        <div className='homepage-phone-screen relative aspect-[430/950] overflow-hidden rounded-[2.2rem] bg-(--system-b-cinematic-black)'>
          <div
            aria-hidden='true'
            className='pointer-events-none absolute left-1/2 top-3 z-[18] h-10 w-32 -translate-x-1/2 rounded-full bg-(--system-b-cinematic-black) shadow-[0_8px_24px_rgba(0,0,0,0.32)]'
          />
          <div
            aria-hidden='true'
            data-testid='home-phone-status-bar'
            className='pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between px-7 pt-4 text-(--system-b-text-primary)'
          >
            <span className='text-mid font-semibold tracking-tighter'>
              9:41
            </span>
            <div className='flex items-center gap-2.5'>
              <div className='flex items-end gap-1'>
                {[8, 12, 16, 20].map(height => (
                  <span
                    key={height}
                    className='block w-1 rounded-full bg-(--system-b-text-primary)'
                    style={{ height }}
                  />
                ))}
              </div>
              <div className='relative h-3 w-5'>
                <span className='absolute inset-0 rounded-full border-[1.8px] border-white/96' />
                <span className='absolute left-1 right-1 top-1 h-1 rounded-full bg-(--system-b-text-primary)' />
              </div>
              <div className='relative h-3 w-6 rounded-xs border-[1.8px] border-white/92'>
                <span className='absolute inset-1 rounded-xs bg-(--system-b-text-primary)' />
                <span className='absolute -right-[3px] top-1 h-1 w-1 rounded-r-full bg-white/92' />
              </div>
            </div>
          </div>
          {children}
        </div>

        <div
          aria-hidden='true'
          className='pointer-events-none absolute bottom-4 left-1/2 h-1 w-[28%] -translate-x-1/2 rounded-full bg-white/22'
        />
      </div>
    </div>
  );
}
