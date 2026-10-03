import { MobileWebScreen } from '@/components/marketing/device/DeviceScreen';
import { cn } from '@/lib/utils';

interface HomePhoneFrameProps {
  readonly children: React.ReactNode;
  readonly compact?: boolean;
  readonly className?: string;
}

/**
 * Homepage profile showcase. Mobile web content renders bezel-free — no
 * simulated island, status bar, reflections, or shadow (device policy in
 * components/marketing/device/deviceBezels.ts).
 */
export function HomePhoneFrame({
  children,
  compact = false,
  className,
}: Readonly<HomePhoneFrameProps>) {
  return (
    <div
      className={cn(
        'homepage-phone-frame relative mx-auto flex w-full max-w-[min(100vw,var(--homepage-phone-frame-width))] shrink-0 items-center justify-center',
        compact
          ? '[--homepage-phone-frame-width:20rem] sm:[--homepage-phone-frame-width:20.25rem]'
          : '[--homepage-phone-frame-width:20.5rem]',
        className
      )}
    >
      <MobileWebScreen className='homepage-phone-screen'>
        {children}
      </MobileWebScreen>
    </div>
  );
}
