interface PhoneFrameProps {
  readonly children: React.ReactNode;
}

export function PhoneFrame({ children }: PhoneFrameProps) {
  return (
    <div
      className='relative mx-auto flex flex-col items-center'
      style={{ width: 280, height: 580 }}
    >
      {/* Outer bezel */}
      <div
        className='relative h-full w-full overflow-hidden rounded-[40px] p-[4px]'
        style={{
          backgroundColor: 'rgb(18, 19, 20)',
          boxShadow: [
            '0 0 0 1px rgba(255,255,255,0.08)',
            '0 4px 32px rgba(8,9,10,0.6)',
            '0 12px 48px rgba(0,0,0,0.4)',
          ].join(', '),
        }}
      >
        {/* Shine border overlay — Linear's glass edge effect */}
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-0 rounded-[40px]'
          style={{
            border: '1px solid rgb(56, 59, 63)',
            borderRadius: '40px',
            zIndex: 5,
          }}
        />

        {/* Top edge highlight — Linear-style glass reflection */}
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-x-0 top-0 h-px'
          style={{
            background:
              'linear-gradient(90deg, transparent, rgba(255,255,255,0.12) 30%, rgba(255,255,255,0.18) 50%, rgba(255,255,255,0.12) 70%, transparent)',
            zIndex: 6,
          }}
        />

        {/* Notch */}
        <div
          aria-hidden='true'
          className='absolute left-1/2 top-2 z-10 -translate-x-1/2'
          style={{
            width: 80,
            height: 24,
            borderRadius: 12,
            backgroundColor: 'rgb(8, 9, 10)',
          }}
        />

        {/* Inner screen */}
        <div
          className='relative h-full w-full overflow-hidden rounded-[36px]'
          style={{ backgroundColor: 'rgb(8, 9, 10)' }}
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
