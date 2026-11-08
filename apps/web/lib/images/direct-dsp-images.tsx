'use client';

import { createContext, type ReactNode, useContext } from 'react';
import { isExternalDspImage } from '@/lib/utils/dsp-images';

/**
 * One-off previews (the /start draft profile) show a Spotify image once per
 * visitor, the moment the artist is matched. Routing it through /_next/image
 * makes the first paint wait on a cold fetch-and-encode and caches a
 * transform nobody requests again, so the preview sat on grey placeholders.
 * Inside this provider, DSP CDN images load straight from the DSP's own
 * sized CDN. Public profiles keep optimization (JOV-2261, LCP).
 */
const DirectDspImagesContext = createContext(false);

export function DirectDspImagesProvider({
  children,
  enabled = true,
}: {
  readonly children: ReactNode;
  readonly enabled?: boolean;
}) {
  return (
    <DirectDspImagesContext.Provider value={enabled}>
      {children}
    </DirectDspImagesContext.Provider>
  );
}

/** True when `src` should skip /_next/image because a preview asked for it. */
export function useDirectDspImage(src: string | null | undefined): boolean {
  const direct = useContext(DirectDspImagesContext);
  return direct && isExternalDspImage(src);
}
