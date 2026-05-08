'use client';

/**
 * Shared browser chrome wrapper for dashboard demo components.
 * Provides the macOS-style window title bar with traffic light dots.
 */
export function BrowserChrome({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <figure
      aria-label={title}
      className='overflow-hidden rounded-xl border border-subtle bg-surface-0'
    >
      {/* Title bar */}
      <div className='flex items-center gap-2 px-3.5 py-2.5 border-b border-subtle'>
        <div className='flex gap-[5px]'>
          <span className='h-2 w-2 rounded-full bg-tertiary-token opacity-35' />
          <span className='h-2 w-2 rounded-full bg-tertiary-token opacity-35' />
          <span className='h-2 w-2 rounded-full bg-tertiary-token opacity-35' />
        </div>
        <div className='flex-1 text-center text-xs text-tertiary-token'>
          {title}
        </div>
        {/* Spacer to balance the dots */}
        <div className='w-[29px]' />
      </div>

      {/* Content */}
      <div className='px-5 pt-4 pb-5'>{children}</div>
    </figure>
  );
}
