import Image from 'next/image';
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
    <div className={cn('ap-phone-frame mx-auto w-full max-w-85', className)}>
      <div className='ap-phone-frame__screen'>
        <div className='h-full w-full'>{children}</div>
      </div>
      <Image
        alt=''
        aria-hidden='true'
        className='ap-phone-frame__plate'
        height={1397}
        src='/homepage/device-frames/iphone-17-pro-silver-front-frame-v1.png'
        unoptimized
        width={675}
      />
    </div>
  );
}
