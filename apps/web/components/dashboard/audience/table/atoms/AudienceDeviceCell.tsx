'use client';

import { Icon } from '@/components/atoms/Icon';
import { cn } from '@/lib/utils';
import { getDeviceIndicator } from '@/lib/utils/audience';

export interface AudienceDeviceCellProps {
  readonly deviceType: string | null;
  readonly className?: string;
}

export function AudienceDeviceCell({
  deviceType,
  className,
}: AudienceDeviceCellProps) {
  const deviceIndicator = getDeviceIndicator(deviceType);

  return (
    <div className={cn('text-xs', className)}>
      {deviceIndicator ? (
        <Icon
          name={deviceIndicator.iconName}
          className='h-3.5 w-3.5 text-secondary-token'
          aria-label={deviceIndicator.label}
          role='img'
        />
      ) : (
        <span className='text-secondary-token'>—</span>
      )}
    </div>
  );
}
