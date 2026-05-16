'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';

// Wrapped in <Suspense> so the `ssr: false` dynamic import does not bail the
// entire parent React tree to client-side rendering. Without the boundary,
// Next.js 15 + React 19 emit `BAILOUT_TO_CLIENT_SIDE_RENDERING` on the nearest
// ancestor Suspense, which on the /[username] route is the implicit boundary
// wrapping `loading.tsx` — causing the animated skeleton to ship as the
// initial visible HTML instead of the actual profile content (JOV-2273).
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
  return (
    <Suspense fallback={null}>
      <DesktopQrOverlay handle={handle} />
    </Suspense>
  );
}
