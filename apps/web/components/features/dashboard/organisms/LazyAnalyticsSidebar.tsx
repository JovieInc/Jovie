'use client';

import dynamic from 'next/dynamic';

/**
 * The analytics rails, loaded on demand. The rail only renders when the
 * analytics panel is open, so keeping it out of the audience workspace's
 * first-load JS costs nothing at open time: the chunk is preloaded on idle.
 */
const loadAnalyticsSidebar = () => import('./AnalyticsSidebar');

if (typeof window !== 'undefined') {
  const idle = globalThis.requestIdleCallback ?? globalThis.setTimeout;
  idle(() => {
    void loadAnalyticsSidebar();
  });
}

export const AnalyticsSidebar = dynamic(() =>
  loadAnalyticsSidebar().then(mod => mod.AnalyticsSidebar)
);

export const StaticAnalyticsSidebar = dynamic(() =>
  loadAnalyticsSidebar().then(mod => mod.StaticAnalyticsSidebar)
);
