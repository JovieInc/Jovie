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
        className='relative h-full w-full overflow-hidden rounded-full p-px'
        style={{
          backgroundColor: 'var(--linear-bg-surface-1)',
          boxShadow: [
            '0 0 0 1px var(--linear-border-default)',
            '0 8px 40px rgba(0,0,0,0.45)',
            '0 24px 80px rgba(0,0,0,0.35)',
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
          className='relative h-full w-full overflow-hidden rounded-4xl'
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
