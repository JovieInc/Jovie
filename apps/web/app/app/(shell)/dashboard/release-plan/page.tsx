'use client';

import { Button } from '@jovie/ui';
import { notFound } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ReleaseCalendar } from '@/components/jovie/release-calendar/ReleaseCalendar';
import { ReleaseMomentDrawer } from '@/components/jovie/release-calendar/ReleaseMomentDrawer';
import { useAppFlag } from '@/lib/flags/client';
import {
  type DemoMoment,
  EP_TRACKS,
  generateDemoPlan,
} from '@/lib/release-planning/demo-plan';

export default function ReleasePlanPage() {
  const enabled = useAppFlag('RELEASE_PLAN_DEMO');
  const [plan, setPlan] = useState<DemoMoment[] | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const selected = useMemo(
    () => plan?.find(m => m.slug === selectedSlug) ?? null,
    [plan, selectedSlug]
  );

  if (!enabled) {
    notFound();
  }

  return (
    <div className='flex min-h-0 flex-1 flex-col gap-6 p-6'>
      {plan === null ? (
        <section
          data-testid='release-plan-empty-state'
          className='flex flex-col gap-6 rounded-lg border border-(--linear-border-subtle) bg-(--linear-bg-surface-0) p-8'
        >
          <div className='flex flex-col gap-1'>
            <h2 className='text-lg font-semibold text-(--linear-text-primary)'>
              Plan the next EP
            </h2>
            <p className='text-sm text-(--linear-text-secondary)'>
              Four tracks. We&rsquo;ll generate the singles, remix, visualizer,
              acoustic, lyric video, merch drop, tour tie-in, media moment, and
              anniversary — Friday-locked.
            </p>
          </div>

          <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4'>
            {EP_TRACKS.map((track, index) => (
              <div
                key={track.slug}
                data-testid={`release-plan-track-${index}`}
                className='flex flex-col gap-1 rounded-md border border-(--linear-border-subtle) bg-(--linear-bg-surface-1) px-3 py-3'
              >
                <span className='text-[10px] font-semibold text-(--linear-text-tertiary)'>
                  Track {index + 1}
                </span>
                <span className='text-sm font-medium text-(--linear-text-primary)'>
                  {track.title}
                </span>
              </div>
            ))}
          </div>

          <Button
            type='button'
            data-testid='release-plan-generate-button'
            onClick={() => setPlan(generateDemoPlan())}
            size='sm'
            className='self-start'
          >
            Generate plan
          </Button>
        </section>
      ) : (
        <ReleaseCalendar
          plan={plan}
          onPlanChange={setPlan}
          onMomentClick={moment => setSelectedSlug(moment.slug)}
        />
      )}

      <ReleaseMomentDrawer
        moment={selected}
        onClose={() => setSelectedSlug(null)}
      />
    </div>
  );
}
