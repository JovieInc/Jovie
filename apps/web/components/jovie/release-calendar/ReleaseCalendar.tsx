'use client';

/**
 * Phase 0 placeholder. Agent B owns this file in Phase 1.
 *
 * Renders enough DOM for the route to load while the calendar UI is built.
 */

import { generateDemoPlan } from '@/lib/release-planning/demo-plan';

export function ReleaseCalendar() {
  const plan = generateDemoPlan();
  return (
    <div data-testid='release-calendar'>
      <p>Release calendar — placeholder ({plan.length} moments)</p>
    </div>
  );
}
