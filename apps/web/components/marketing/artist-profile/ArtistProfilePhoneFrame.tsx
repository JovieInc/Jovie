import { MobileWebScreen } from '@/components/marketing/device/DeviceScreen';
import { cn } from '@/lib/utils';
import './ArtistProfilePhoneFrame.css';

export type ArtistProfilePhoneFrameSize = 'lg' | 'md' | 'sm';

interface ArtistProfilePhoneFrameProps {
  readonly className?: string;
  readonly children: React.ReactNode;
  readonly size?: ArtistProfilePhoneFrameSize;
}

/**
 * Live public-profile preview. The profile is mobile web, so it renders
 * bezel-free (see components/marketing/device/deviceBezels.ts); only the
 * size variants live here.
 */
export function ArtistProfilePhoneFrame({
  className,
  children,
  size = 'lg',
}: Readonly<ArtistProfilePhoneFrameProps>) {
  return (
    <div className={cn('ap-phone-frame', className)} data-size={size}>
      <MobileWebScreen className='ap-phone-frame__screen'>
        <div className='ap-phone-frame__viewport'>{children}</div>
      </MobileWebScreen>
    </div>
  );
}
