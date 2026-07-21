import { cn } from '@/lib/utils';

interface ArtistProfilePhoneFrameProps {
  readonly className?: string;
  readonly children: React.ReactNode;
}

export function ArtistProfilePhoneFrame({
  className,
  children,
}: Readonly<ArtistProfilePhoneFrameProps>) {
  return (
    <div
      className={cn(
        'mx-auto w-full max-w-85 rounded-4xl border border-subtle bg-surface-1 p-3',
        className
      )}
    >
      <div className='relative aspect-[9/19.5] overflow-hidden rounded-3xl border border-subtle bg-surface-0'>
        <div
          aria-hidden='true'
          className='absolute left-1/2 top-3 z-20 h-6 w-28 -translate-x-1/2 rounded-full bg-base ring-1 ring-subtle'
        />
        <div className='relative z-10 h-full w-full'>{children}</div>
      </div>
    </div>
  );
}
