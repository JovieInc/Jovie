'use client';

import { Button } from '@jovie/ui';
import { notFound } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ReleaseCalendar } from '@/components/jovie/release-calendar/ReleaseCalendar';
import { ReleaseMomentDrawer } from '@/components/jovie/release-calendar/ReleaseMomentDrawer';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { useAppFlag } from '@/lib/flags/client';
import {
  type DemoMoment,
  EP_TRACKS,
  generateDemoPlan,
} from '@/lib/release-planning/demo-plan';

const RELEASE_PLAN_SUBTITLE =
  "Four tracks. We'll generate the singles, remix, visualizer, acoustic, lyric video, merch drop, tour tie-in, media moment, and anniversary - Friday-locked.";

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
    <div className='flex min-h-0 flex-1 flex-col gap-4 px-3 py-3 sm:px-4 sm:py-4'>
      {plan === null ? (
        <ContentSurfaceCard
          as='section'
          data-testid='release-plan-empty-state'
          className='overflow-hidden p-0'
        >
          <ContentSectionHeader
            title='Plan the next EP'
            subtitle={RELEASE_PLAN_SUBTITLE}
            actions={
              <Button
                type='button'
                data-testid='release-plan-generate-button'
                onClick={() => setPlan(generateDemoPlan())}
                size='sm'
              >
                Generate plan
              </Button>
            }
            subtitleClassName='whitespace-normal'
          />

          <div className='grid grid-cols-1 gap-2.5 p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-4'>
            {EP_TRACKS.map((track, index) => (
              <div
                key={track.slug}
                data-testid={`release-plan-track-${index}`}
                className='flex flex-col gap-1 rounded-md border border-subtle bg-surface-0 px-3 py-3'
              >
                <span className='text-[11px] font-caption text-tertiary-token'>
                  Track {index + 1}
                </span>
                <span className='text-[13px] font-medium text-primary-token'>
                  {track.title}
                </span>
              </div>
            ))}
          </div>
        </ContentSurfaceCard>
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
