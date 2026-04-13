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
        'homepage-phone-frame relative mx-auto flex shrink-0 items-center justify-center',
        compact
          ? 'w-full max-w-[20rem] sm:max-w-[20.25rem]'
          : 'w-full max-w-[20.5rem]',
        className
      )}
    >
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-x-[10%] top-[4%] h-[18%] rounded-full bg-[radial-gradient(circle,rgba(176,197,255,0.18),rgba(176,197,255,0.05)_48%,transparent_76%)] blur-3xl'
      />

      <div className='homepage-phone-device relative w-full rounded-[2.65rem] p-[8px] shadow-[0_28px_84px_rgba(0,0,0,0.42)]'>
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-[1px] rounded-[2.55rem] border border-white/12'
        />
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-[2px] rounded-[2.5rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.12),rgba(255,255,255,0.02)_14%,rgba(255,255,255,0.01)_86%,rgba(255,255,255,0.08))]'
        />
        <div
          aria-hidden='true'
          className='pointer-events-none absolute left-[11%] right-[11%] top-[10px] h-[24px] rounded-full bg-black'
        />
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-[8px] rounded-[2.3rem] bg-[linear-gradient(165deg,rgba(255,255,255,0.14),rgba(255,255,255,0)_22%)] opacity-90'
        />

        <div className='homepage-phone-screen relative aspect-[430/920] overflow-hidden rounded-[2.2rem] bg-black'>
          {children}
        </div>

        <div
          aria-hidden='true'
          className='pointer-events-none absolute bottom-[14px] left-1/2 h-[4px] w-[28%] -translate-x-1/2 rounded-full bg-white/22'
        />
      </div>
    </div>
  );
}
