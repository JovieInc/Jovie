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
      <div className='ap-phone-frame__screen relative aspect-[195/422] overflow-hidden bg-surface-0'>
        <div className='relative z-10 h-full w-full'>{children}</div>
      </div>
    </div>
  );
}
