import Image from 'next/image';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import './DeviceScreen.css';
import { OFFICIAL_IPHONE_BEZEL } from './deviceBezels';

interface MobileWebScreenProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly testId?: string;
}

/** Bezel-free frame for mobile web captures and live web UI. */
export function MobileWebScreen({
  children,
  className,
  testId,
}: Readonly<MobileWebScreenProps>) {
  return (
    <div
      className={cn('mobile-web-screen', className)}
      data-device='mobile-web'
      data-testid={testId}
    >
      {children}
    </div>
  );
}

export interface NativeIosScreenshot {
  /** Only native iOS app captures may appear in the official bezel. */
  readonly platform: 'ios-native';
  readonly src: string;
  readonly alt: string;
  readonly width: number;
  readonly height: number;
}

interface OfficialIPhoneFrameProps {
  readonly screenshot: NativeIosScreenshot;
  readonly sizes: string;
  readonly priority?: boolean;
  /** Width/placement only — the bezel itself is never styled. */
  readonly className?: string;
}

/** Official Apple iPhone Pro bezel around a native iOS app screenshot. */
export function OfficialIPhoneFrame({
  screenshot,
  sizes,
  priority,
  className,
}: Readonly<OfficialIPhoneFrameProps>) {
  return (
    <figure
      className={cn('official-iphone-frame', className)}
      data-device='official-iphone'
      data-device-model={OFFICIAL_IPHONE_BEZEL.model}
    >
      <div className='official-iphone-frame__screen'>
        <Image
          src={screenshot.src}
          alt={screenshot.alt}
          width={screenshot.width}
          height={screenshot.height}
          sizes={sizes}
          priority={priority}
          className='block h-full w-full object-cover object-top'
        />
      </div>
      <Image
        src={OFFICIAL_IPHONE_BEZEL.src}
        alt=''
        aria-hidden='true'
        width={OFFICIAL_IPHONE_BEZEL.width}
        height={OFFICIAL_IPHONE_BEZEL.height}
        sizes={sizes}
        unoptimized
        className='official-iphone-frame__bezel'
      />
    </figure>
  );
}
