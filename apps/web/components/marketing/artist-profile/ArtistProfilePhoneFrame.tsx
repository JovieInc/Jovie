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
        'mx-auto w-full max-w-[340px] rounded-[2.4rem] border border-white/12 bg-[linear-gradient(180deg,rgba(20,21,28,0.98),rgba(10,11,15,0.98))] p-3 shadow-[0_34px_100px_rgba(0,0,0,0.48),0_14px_36px_rgba(0,0,0,0.28)]',
        className
      )}
    >
      <div className='relative aspect-[9/19.5] overflow-hidden rounded-[1.85rem] border border-white/8 bg-[#090a0d]'>
        <div
          aria-hidden='true'
          className='absolute left-1/2 top-3 z-20 h-6 w-28 -translate-x-1/2 rounded-full bg-black/70 ring-1 ring-white/8'
        />
        <div
          aria-hidden='true'
          className='absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(126,133,154,0.14),transparent_35%),linear-gradient(180deg,rgba(255,255,255,0.04),transparent_22%,transparent_78%,rgba(0,0,0,0.22))]'
        />
        <div className='relative z-10 h-full w-full'>{children}</div>
      </div>
    </div>
  );
}
