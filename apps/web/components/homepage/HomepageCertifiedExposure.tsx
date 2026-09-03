// @coverage-via apps/web/tests/unit/home/HomepageEditorialHero.test.tsx
'use client';

import { useEffect } from 'react';
import {
  HOMEPAGE_CERTIFIED_CONTEXT,
  HOMEPAGE_CERTIFIED_EVENTS,
} from '@/data/homepageCertifiedOptimization';
import { page, track } from '@/lib/analytics';

/**
 * One exposure receipt per homepage visit. Search-submit outcomes fire from
 * the existing name-search control with the same variant identity.
 */
export function HomepageCertifiedExposure() {
  useEffect(() => {
    page('home', HOMEPAGE_CERTIFIED_CONTEXT);
    track(HOMEPAGE_CERTIFIED_EVENTS.EXPOSURE, HOMEPAGE_CERTIFIED_CONTEXT);
    track(HOMEPAGE_CERTIFIED_EVENTS.SEARCH_EXPOSED, HOMEPAGE_CERTIFIED_CONTEXT);
  }, []);

  return null;
}
