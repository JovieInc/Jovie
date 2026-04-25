'use client';

import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { RELEASE_PLAN_MOVE_REMIX_NEAR_LA } from '@/lib/release-planning/demo-events';
import {
  addDaysIso,
  DEMO_PLAN_START_FRIDAY,
  DEMO_TOUR_DATES,
  type DemoMoment,
  fridayOfWeek,
  type MomentType,
  moveRemixNearLAShow,
} from '@/lib/release-planning/demo-plan';

const MOMENT_COLOR: Readonly<Record<MomentType, string>> = {
  single:
    'bg-emerald-500/10 border-emerald-500/40 text-emerald-100 hover:bg-emerald-500/20',
  remix:
    'bg-fuchsia-500/15 border-fuchsia-500/50 text-fuchsia-100 hover:bg-fuchsia-500/25',
  acoustic:
    'bg-amber-500/10 border-amber-500/40 text-amber-100 hover:bg-amber-500/20',
  lyric_video:
    'bg-sky-500/10 border-sky-500/40 text-sky-100 hover:bg-sky-500/20',
  visualizer:
    'bg-indigo-500/10 border-indigo-500/40 text-indigo-100 hover:bg-indigo-500/20',
  merch_drop:
    'bg-orange-500/10 border-orange-500/40 text-orange-100 hover:bg-orange-500/20',
  tour_tie_in:
    'bg-rose-500/10 border-rose-500/40 text-rose-100 hover:bg-rose-500/20',
  media_appearance:
    'bg-cyan-500/10 border-cyan-500/40 text-cyan-100 hover:bg-cyan-500/20',
  anniversary:
    'bg-violet-500/10 border-violet-500/40 text-violet-100 hover:bg-violet-500/20',
};

const MOMENT_LABEL: Readonly<Record<MomentType, string>> = {
  single: 'Single',
  remix: 'Remix',
  acoustic: 'Acoustic',
  lyric_video: 'Lyric video',
  visualizer: 'Visualizer',
  merch_drop: 'Merch drop',
  tour_tie_in: 'Tour tie-in',
  media_appearance: 'Media',
  anniversary: 'Anniversary',
};

const MOVED_BADGE_DURATION_MS = 1500;

export interface ReleaseCalendarProps {
  readonly plan: DemoMoment[];
  readonly onPlanChange: (next: DemoMoment[]) => void;
  readonly onMomentClick: (moment: DemoMoment) => void;
}

interface WeekColumn {
  readonly friday: string;
  readonly weekStart: string;
  readonly weekEnd: string;
  readonly moments: DemoMoment[];
  readonly tourDates: typeof DEMO_TOUR_DATES;
}

function buildWeeks(plan: DemoMoment[]): WeekColumn[] {
  const tourFridays = DEMO_TOUR_DATES.map(t => fridayOfWeek(t.date));
  const planFridays = plan.map(m => m.friday);
  const allFridays = [
    DEMO_PLAN_START_FRIDAY,
    ...planFridays,
    ...tourFridays,
  ].sort();
  const start = allFridays[0];
  const end = allFridays[allFridays.length - 1];
  const buffer = addDaysIso(end, 7);

  const fridays: string[] = [];
  let cursor = start;
  while (cursor <= buffer) {
    fridays.push(cursor);
    cursor = addDaysIso(cursor, 7);
  }

  return fridays.map(friday => {
    const weekStart = addDaysIso(friday, -4); // Monday
    const weekEnd = addDaysIso(friday, 2); // Sunday
    const moments = plan.filter(m => m.friday === friday);
    const tourDates = DEMO_TOUR_DATES.filter(
      t => fridayOfWeek(t.date) === friday
    );
    return { friday, weekStart, weekEnd, moments, tourDates };
  });
}

const MONTH_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

function formatShort(iso: string): string {
  return MONTH_FORMATTER.format(new Date(`${iso}T00:00:00Z`));
}

export function ReleaseCalendar({
  plan,
  onPlanChange,
  onMomentClick,
}: ReleaseCalendarProps) {
  const weeks = useMemo(() => buildWeeks(plan), [plan]);
  const [movedSlug, setMovedSlug] = useState<string | null>(null);
  const weekRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    const handle = () => {
      const next = moveRemixNearLAShow(plan);
      const prevRemix = plan.find(m => m.momentType === 'remix');
      const nextRemix = next.find(m => m.momentType === 'remix');
      onPlanChange(next);
      if (!nextRemix) return;
      if (prevRemix && prevRemix.friday === nextRemix.friday) return;
      setMovedSlug(nextRemix.slug);
      requestAnimationFrame(() => {
        const el = weekRefs.current.get(nextRemix.friday);
        el?.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center',
        });
      });
      const timer = window.setTimeout(
        () => setMovedSlug(null),
        MOVED_BADGE_DURATION_MS
      );
      return () => window.clearTimeout(timer);
    };
    window.addEventListener(RELEASE_PLAN_MOVE_REMIX_NEAR_LA, handle);
    return () => {
      window.removeEventListener(RELEASE_PLAN_MOVE_REMIX_NEAR_LA, handle);
    };
  }, [plan, onPlanChange]);

  return (
    <div
      data-testid='release-calendar'
      className='overflow-x-auto rounded-lg border border-(--linear-border-subtle) bg-(--linear-bg-surface-0)'
    >
      <LayoutGroup>
        <div className='flex min-w-max gap-3 p-4'>
          {weeks.map(week => (
            <div
              key={week.friday}
              ref={node => {
                if (node) weekRefs.current.set(week.friday, node);
                else weekRefs.current.delete(week.friday);
              }}
              data-testid={`release-calendar-week-${week.friday}`}
              className='flex w-44 shrink-0 flex-col gap-2'
            >
              <div className='flex items-baseline justify-between border-b border-(--linear-border-subtle) pb-1'>
                <span className='text-xs font-semibold uppercase tracking-wide text-(--linear-text-secondary)'>
                  {formatShort(week.friday)}
                </span>
                <span className='text-[10px] text-(--linear-text-tertiary)'>
                  Fri
                </span>
              </div>
              <div className='flex min-h-24 flex-col gap-2'>
                {week.tourDates.map(tour => (
                  <div
                    key={tour.id}
                    data-testid={`release-tour-date-${tour.id}`}
                    className='rounded border border-dashed border-rose-400/60 bg-rose-500/5 px-2 py-1 text-[11px] text-rose-200'
                  >
                    <span className='font-semibold'>Tour</span> · {tour.city}
                    <div className='text-[10px] text-rose-300/80'>
                      {formatShort(tour.date)}
                    </div>
                  </div>
                ))}
                <AnimatePresence initial={false}>
                  {week.moments.map(moment => (
                    <motion.button
                      key={moment.slug}
                      type='button'
                      layoutId={`moment-${moment.slug}`}
                      data-testid={`release-moment-card-${moment.slug}`}
                      data-release-date={moment.friday}
                      data-moment-type={moment.momentType}
                      onClick={() => onMomentClick(moment)}
                      className={`relative flex flex-col gap-1 rounded-md border px-2 py-2 text-left text-xs transition-colors ${MOMENT_COLOR[moment.momentType]}`}
                      transition={{
                        layout: { duration: 0.5, ease: 'easeInOut' },
                      }}
                    >
                      <span className='text-[10px] font-semibold uppercase tracking-wide opacity-80'>
                        {MOMENT_LABEL[moment.momentType]}
                      </span>
                      <span className='font-medium leading-snug'>
                        {moment.title}
                      </span>
                      {movedSlug === moment.slug && (
                        <motion.span
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          data-testid={`release-calendar-moved-badge-${moment.slug}`}
                          className='absolute -right-1 -top-2 rounded-full bg-fuchsia-500 px-2 py-0.5 text-[9px] font-bold text-white shadow'
                        >
                          Moved
                        </motion.span>
                      )}
                    </motion.button>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          ))}
        </div>
      </LayoutGroup>
    </div>
  );
}
