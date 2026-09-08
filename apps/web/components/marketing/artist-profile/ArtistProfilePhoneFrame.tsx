import { cn } from '@/lib/utils';
import './ArtistProfilePhoneFrame.css';

export type ArtistProfilePhoneFrameSize = 'lg' | 'md' | 'sm';

interface ArtistProfilePhoneFrameProps {
  readonly className?: string;
  readonly children: React.ReactNode;
  readonly size?: ArtistProfilePhoneFrameSize;
}

export function ArtistProfilePhoneFrame({
  className,
  children,
  size = 'lg',
}: Readonly<ArtistProfilePhoneFrameProps>) {
  return (
    <div className={cn('ap-phone-frame', className)} data-size={size}>
      <div className='ap-phone-frame__screen'>
        <div aria-hidden='true' className='ap-phone-frame__notch' />
        <div aria-hidden='true' className='ap-phone-frame__overlay' />
        <div className='ap-phone-frame__viewport'>{children}</div>
      </div>
    </div>
  );
}
