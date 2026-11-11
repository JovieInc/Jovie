'use client';

import dynamic from 'next/dynamic';

/**
 * JOV-12023: the release identity lives in the desktop titlebar module, whose
 * graph (electron-bridge wiring, update modal, radix dialog) must stay out of
 * every browser tab's initial chunks — #24725 named this the last eager edge.
 * Loaded only when the electron runtime is detected; the browser renders the
 * plain web version string instead.
 */
export const DesktopReleaseIdentity = dynamic(
  () =>
    import('@/components/organisms/DesktopTitlebar').then(mod => ({
      default: mod.DesktopReleaseIdentity,
    })),
  { ssr: false, loading: () => null }
);
