'use client';

/**
 * Phase 0 placeholder. Agent C owns this file in Phase 1.
 */

import type { DemoMoment } from '@/lib/release-planning/demo-plan';

export function ReleaseMomentDrawer({ moment }: { moment: DemoMoment | null }) {
  if (!moment) return null;
  return (
    <div data-testid='release-moment-drawer'>
      <p>{moment.title}</p>
    </div>
  );
}
