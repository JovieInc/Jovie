import { cn } from '@/lib/utils';
import './ArtistProfilePhoneFrame.css';

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
      className={cn('ap-phone-frame mx-auto w-full max-w-85 p-3', className)}
    >
      <div className='ap-phone-frame__screen relative aspect-[9/19.5] overflow-hidden bg-surface-0'>
        <div
          aria-hidden='true'
          className='ap-phone-frame__notch absolute left-1/2 top-3 z-20 h-6 w-28 -translate-x-1/2 rounded-full'
        />
        <div
          aria-hidden='true'
          className='ap-phone-frame__overlay absolute inset-0'
        />
        <div className='relative z-10 h-full w-full'>{children}</div>
      </div>
    </div>
  );
}
