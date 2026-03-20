'use client';

import type { ReactNode } from 'react';
import { IPadFrame } from './IPadFrame';
import { IPhoneFrame } from './IPhoneFrame';
import { MacBookFrame } from './MacBookFrame';

export type DeviceType = 'none' | 'macbook' | 'iphone' | 'ipad';

interface DeviceFrameProps {
  readonly device: DeviceType;
  readonly children: ReactNode;
}

export function DeviceFrame({ device, children }: DeviceFrameProps) {
  switch (device) {
    case 'macbook':
      return <MacBookFrame>{children}</MacBookFrame>;
    case 'iphone':
      return <IPhoneFrame>{children}</IPhoneFrame>;
    case 'ipad':
      return <IPadFrame>{children}</IPadFrame>;
    default:
      return <>{children}</>;
  }
}
