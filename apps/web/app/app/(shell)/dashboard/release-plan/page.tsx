import { ReleaseCalendar } from '@/components/jovie/release-calendar/ReleaseCalendar';

/**
 * Phase 0 placeholder. Agent B owns this file in Phase 1.
 *
 * Reachable at /app/dashboard/release-plan once integrated with the shell.
 */

export const runtime = 'nodejs';

export default function ReleasePlanPage() {
  return (
    <div className='p-6'>
      <h1 className='text-2xl font-semibold'>Release plan</h1>
      <ReleaseCalendar />
    </div>
  );
}
