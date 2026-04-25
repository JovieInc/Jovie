'use client';

import { useState } from 'react';
import { ReleaseCalendar } from '@/components/jovie/release-calendar/ReleaseCalendar';
import { ReleaseMomentDrawer } from '@/components/jovie/release-calendar/ReleaseMomentDrawer';
import {
  type DemoMoment,
  EP_TRACKS,
  generateDemoPlan,
} from '@/lib/release-planning/demo-plan';

export default function ReleasePlanPage() {
  const [plan, setPlan] = useState<DemoMoment[] | null>(null);
  const [selected, setSelected] = useState<DemoMoment | null>(null);

  return (
    <div className='flex flex-col gap-6 p-6'>
      <header className='flex flex-col gap-1'>
        <h1 className='text-2xl font-semibold text-(--linear-text-primary)'>
          Release plan
        </h1>
        <p className='text-sm text-(--linear-text-secondary)'>
          Friday-cadence release calendar with workflows under every moment.
        </p>
      </header>

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
                <span className='text-[10px] font-semibold uppercase tracking-wide text-(--linear-text-tertiary)'>
                  Track {index + 1}
                </span>
                <span className='text-sm font-medium text-(--linear-text-primary)'>
                  {track.title}
                </span>
              </div>
            ))}
          </div>

          <button
            type='button'
            data-testid='release-plan-generate-button'
            onClick={() => setPlan(generateDemoPlan())}
            className='self-start rounded-md bg-fuchsia-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-fuchsia-600'
          >
            Generate plan
          </button>
        </section>
      ) : (
        <ReleaseCalendar
          plan={plan}
          onPlanChange={setPlan}
          onMomentClick={setSelected}
        />
      )}

      <ReleaseMomentDrawer
        moment={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
