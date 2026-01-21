'use client';

import dynamic from 'next/dynamic';

const DesktopQrOverlay = dynamic(
  () =>
    import('./DesktopQrOverlay').then(mod => ({
      default: mod.DesktopQrOverlay,
    })),
  {
    ssr: false,
    loading: () => null,
  }
);

export function DesktopQrOverlayClient({
  handle,
}: Readonly<{ handle: string }>) {
  return <DesktopQrOverlay handle={handle} />;
}
