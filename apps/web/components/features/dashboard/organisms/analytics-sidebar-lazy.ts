'use client';

import dynamic from 'next/dynamic';

// The analytics rail renders only once its panel opens, so it loads in its own
// chunk (still server-rendered when open) and stays out of the audience page's
// first-load JS, which has a per-route budget.
export const AnalyticsSidebar = dynamic(() =>
  import('./AnalyticsSidebar').then(module => module.AnalyticsSidebar)
);

export const StaticAnalyticsSidebar = dynamic(() =>
  import('./AnalyticsSidebar').then(module => module.StaticAnalyticsSidebar)
);
