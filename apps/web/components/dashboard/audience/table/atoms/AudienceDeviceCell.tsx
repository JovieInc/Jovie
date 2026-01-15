'use client';

import { Icon } from '@/components/atoms/Icon';
import { cn } from '@/lib/utils';
import { getDeviceIndicator } from '@/lib/utils/audience';

export interface AudienceDeviceCellProps {
  deviceType: string | null;
  className?: string;
}

export function AudienceDeviceCell({
  deviceType,
  className,
}: AudienceDeviceCellProps) {
  const deviceIndicator = getDeviceIndicator(deviceType);

  return (
    <div className={cn('text-sm', className)}>
      {deviceIndicator ? (
        <Icon
          name={deviceIndicator.iconName}
          className='h-4 w-4 text-secondary-token'
          aria-label={deviceIndicator.label}
          role='img'
        />
      ) : (
        <span className='text-secondary-token'>—</span>
      )}
    </div>
  );
}
