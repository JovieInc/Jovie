'use client';

import { useEffect } from 'react';
import {
  HOMEPAGE_CERTIFIED_CONTEXT,
  HOMEPAGE_CERTIFIED_EVENTS,
} from '@/data/homepageCertifiedOptimization';
import { page, track } from '@/lib/analytics';
/**
 * One exposure receipt per homepage visit. The locked conversion is the name
 * search, so the exposure event stays search even while the waitlist gate is on.
 */
export function HomepageCertifiedExposure() {
  useEffect(() => {
    page('home', HOMEPAGE_CERTIFIED_CONTEXT);
    track(HOMEPAGE_CERTIFIED_EVENTS.EXPOSURE, HOMEPAGE_CERTIFIED_CONTEXT);
    track(HOMEPAGE_CERTIFIED_EVENTS.SEARCH_EXPOSED, HOMEPAGE_CERTIFIED_CONTEXT);
  }, []);

  return null;
}
