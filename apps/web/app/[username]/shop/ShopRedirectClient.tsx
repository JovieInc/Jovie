'use client';

import { useEffect, useRef } from 'react';
import { ProfileRedirectSurface } from '@/components/features/profile/ProfileRedirectSurface';
import { postJsonBeacon } from '@/lib/tracking/json-beacon';

interface ShopRedirectClientProps {
  readonly redirectUrl: string;
  readonly username: string;
}

export function ShopRedirectClient({
  redirectUrl,
  username,
}: Readonly<ShopRedirectClientProps>) {
  const tracked = useRef(false);

  useEffect(() => {
    if (tracked.current) return;
    tracked.current = true;

    try {
      postJsonBeacon('/api/track', {
        handle: username,
        linkType: 'other',
        target: redirectUrl,
        context: {
          provider: 'shopify',
        },
      });
    } catch {
      // Tracking failure should never block the redirect.
    }

    const timeoutId = setTimeout(() => {
      globalThis.location.href = redirectUrl;
    }, 50);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [redirectUrl, username]);

  return (
    <ProfileRedirectSurface
      title='Opening shop'
      description='Loading the artist shop for this profile.'
      helperText='You will be redirected to the external storefront.'
    />
  );
}
