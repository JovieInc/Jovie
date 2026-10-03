import type { ReactNode } from 'react';
import { MobileWebScreen } from '@/components/marketing/device/DeviceScreen';
import { cn } from '@/lib/utils';

interface PhoneFrameProps {
  readonly children: ReactNode;
  readonly className?: string;
}

/** Bezel-free mobile web preview (device policy: deviceBezels.ts). */
export function PhoneFrame({ children, className }: PhoneFrameProps) {
  return (
    <div className={cn('relative mx-auto w-71', className)}>
      <MobileWebScreen>{children}</MobileWebScreen>
    </div>
  );
}
