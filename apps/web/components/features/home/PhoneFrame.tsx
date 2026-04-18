import { cn } from '@/lib/utils';

interface PhoneFrameProps {
  readonly children: React.ReactNode;
  readonly className?: string;
}

export function PhoneFrame({ children, className }: PhoneFrameProps) {
  return (
    <div
      className={cn(
        'relative mx-auto flex h-[592px] w-[282px] flex-col items-center',
        className
      )}
    >
      {/* Outer bezel */}
      <div
        className='relative h-full w-full overflow-hidden rounded-[2rem] p-px'
        style={{
          backgroundColor:
            'color-mix(in oklab, var(--linear-bg-surface-1) 92%, var(--linear-bg-page))',
          boxShadow: [
            '0 0 0 1px var(--linear-border-default)',
            '0 0 0 3px rgba(255,255,255,0.015)',
            '0 12px 34px rgba(0,0,0,0.34)',
            '0 24px 56px rgba(0,0,0,0.2)',
          ].join(', '),
        }}
      >
        {/* Notch */}
        <div
          aria-hidden='true'
          className='absolute left-1/2 top-2 z-10 -translate-x-1/2'
          style={{
            width: 80,
            height: 24,
            borderRadius: 12,
            backgroundColor: 'var(--linear-bg-page)',
          }}
        />

        {/* Inner screen */}
        <div
          className='relative h-full w-full overflow-hidden rounded-[1.9rem]'
          style={{ backgroundColor: 'var(--linear-bg-page)' }}
        >
          {children}
        </div>

        {/* Home indicator */}
        <div
          aria-hidden='true'
          className='absolute bottom-2 left-1/2 -translate-x-1/2'
          style={{
            width: 120,
            height: 4,
            borderRadius: 2,
            backgroundColor: 'rgba(255, 255, 255, 0.15)',
          }}
        />
      </div>
    </div>
  );
}
