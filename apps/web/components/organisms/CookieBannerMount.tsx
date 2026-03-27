'use client';

import { type ComponentType, useEffect, useState } from 'react';
import { COOKIE_BANNER_REQUIRED_COOKIE } from '@/lib/cookies/consent-regions';

function shouldMountCookieBanner(pathname: string): boolean {
  if (pathname.startsWith('/app') || pathname.startsWith('/demo')) {
    return false;
  }

  const bannerCookie = document.cookie
    .split(';')
    .find(cookie =>
      cookie.trim().startsWith(`${COOKIE_BANNER_REQUIRED_COOKIE}=`)
    );

  if (!bannerCookie || bannerCookie.split('=')[1]?.trim() === '0') {
    return false;
  }

  try {
    return !localStorage.getItem('jv_cc');
  } catch {
    return true;
  }
}

export function CookieBannerMount() {
  const [Banner, setBanner] = useState<ComponentType | null>(null);

  useEffect(() => {
    if (!shouldMountCookieBanner(globalThis.location.pathname)) {
      return;
    }

    void import('@/components/organisms/CookieBannerSection').then(mod => {
      setBanner(() => mod.CookieBannerSection);
    });
  }, []);

  return Banner ? <Banner /> : null;
}
