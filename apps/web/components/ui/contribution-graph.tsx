'use client';

import { motion } from 'motion/react';
import type { CSSProperties } from 'react';
import { useMemo } from 'react';
import type { ContributionData } from '@/components/ui/contribution-graph.types';
import { cn } from '@/lib/utils';

export type { ContributionData } from '@/components/ui/contribution-graph.types';

export interface ContributionGraphProps {
  readonly data?: readonly ContributionData[];
  readonly year?: number;
  readonly className?: string;
  readonly showLegend?: boolean;
  readonly showTooltips?: boolean;
  readonly ariaLabel?: string;
  readonly reducedMotion?: boolean;
}

interface CalendarCell extends ContributionData {
  readonly inYear: boolean;
  readonly dayIndex: number;
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const WEEK_COUNT = 53;
const DAY_COUNT = 7;
const LEVELS = [0, 1, 2, 3, 4] as const;
const FALLBACK_GRAPH_YEAR = 2026;

function dateKeyFromDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = date.getUTCDate().toString().padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getLevelClassName(level: number, inYear: boolean): string {
  if (!inYear) return 'bg-white/[0.015]';
  if (level >= 4) return 'bg-[var(--linear-accent,#5e6ad2)]';
  if (level === 3) return 'bg-[var(--linear-accent,#5e6ad2)]/75';
  if (level === 2) return 'bg-[var(--linear-accent,#5e6ad2)]/50';
  if (level === 1) return 'bg-[var(--linear-accent,#5e6ad2)]/25';
  return 'bg-white/[0.035]';
}

function isWorkday(dayIndex: number): boolean {
  return dayIndex >= 1 && dayIndex <= 5;
}

function formatDateLabel(dateKey: string): string {
  if (!dateKey) return '';

  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${dateKey}T00:00:00.000Z`));
}

function getContributionText(count: number, label?: string): string {
  if (count === 0) return 'No rhythm signal';
  if (label) return label;
  if (count === 1) return '1 active Friday';
  return `${count} active Fridays`;
}

function getGraphYear(data: readonly ContributionData[]): number {
  const firstDate = data[0]?.date;
  const parsedYear = firstDate ? Number.parseInt(firstDate.slice(0, 4), 10) : 0;

  return Number.isFinite(parsedYear) && parsedYear > 0
    ? parsedYear
    : FALLBACK_GRAPH_YEAR;
}

export function ContributionGraph({
  data = [],
  year = getGraphYear(data),
  className,
  showLegend = true,
  showTooltips = true,
  ariaLabel,
  reducedMotion = false,
}: ContributionGraphProps) {
  const dataByDate = useMemo(
    () => new Map(data.map(day => [day.date, day])),
    [data]
  );

  const { cells, monthLabels } = useMemo(() => {
    const startDate = new Date(Date.UTC(year, 0, 1));
    const firstSunday = new Date(startDate);
    firstSunday.setUTCDate(startDate.getUTCDate() - startDate.getUTCDay());

    const generatedCells: CalendarCell[] = [];
    const labels: Array<{
      readonly id: string;
      readonly label: string;
      readonly columnStart: number;
      readonly monthIndex: number;
    }> = [];
    const seenMonths = new Set<string>();

    for (let weekIndex = 0; weekIndex < WEEK_COUNT; weekIndex += 1) {
      const weekDate = new Date(firstSunday);
      weekDate.setUTCDate(firstSunday.getUTCDate() + weekIndex * DAY_COUNT);

      if (weekDate.getUTCFullYear() === year) {
        const monthKey = `${year}-${weekDate.getUTCMonth()}`;

        if (!seenMonths.has(monthKey)) {
          seenMonths.add(monthKey);
          labels.push({
            id: monthKey,
            label: MONTHS[weekDate.getUTCMonth()] ?? '',
            columnStart: weekIndex + 2,
            monthIndex: weekDate.getUTCMonth(),
          });
        }
      }

      for (let dayIndex = 0; dayIndex < DAY_COUNT; dayIndex += 1) {
        const currentDate = new Date(firstSunday);
        currentDate.setUTCDate(
          firstSunday.getUTCDate() + weekIndex * DAY_COUNT + dayIndex
        );

        const date = dateKeyFromDate(currentDate);
        const inYear = currentDate.getUTCFullYear() === year;
        const contribution = dataByDate.get(date);

        generatedCells.push({
          date,
          count: contribution?.count ?? 0,
          level: contribution?.level ?? 0,
          accentColor: contribution?.accentColor,
          accentMuted: contribution?.accentMuted,
          label: contribution?.label,
          inYear,
          dayIndex,
        });
      }
    }

    return { cells: generatedCells, monthLabels: labels };
  }, [dataByDate, year]);

  return (
    <div className={cn('w-full text-white/55', className)}>
      <div
        className='overflow-hidden pb-3'
        aria-label={ariaLabel ?? `Contribution graph for ${year}`}
        role='img'
      >
        <div
          aria-hidden='true'
          className='grid min-w-0 gap-[2px] text-[10px] leading-none sm:gap-1'
          style={{
            gridTemplateColumns: `clamp(1.5rem, 3vw, 2rem) repeat(${WEEK_COUNT}, minmax(0, 1fr))`,
            gridTemplateRows: '1rem repeat(7, minmax(0, 1fr))',
          }}
        >
          {monthLabels.map(month => (
            <span
              key={month.id}
              className={cn(
                'self-end text-left text-[10px] font-normal leading-none text-white/24',
                month.monthIndex % 3 !== 0 && 'hidden sm:block'
              )}
              style={{ gridColumnStart: month.columnStart, gridRowStart: 1 }}
            >
              {month.label}
            </span>
          ))}

          {DAYS.map((day, dayIndex) => (
            <span
              key={day}
              className={cn(
                'self-center text-left text-[10px] font-normal leading-none text-white/24',
                !isWorkday(dayIndex) && 'opacity-0',
                day === 'Fri' && 'text-white/42'
              )}
              style={{ gridColumnStart: 1, gridRowStart: dayIndex + 2 }}
            >
              {day}
            </span>
          ))}

          {cells.map((day, index) => {
            const weekIndex = Math.floor(index / DAY_COUNT);
            const isFriday = day.dayIndex === 5;
            const isActive = day.count > 0;
            const isWeekend = !isWorkday(day.dayIndex);
            const activeCellStyle: CSSProperties | undefined =
              isActive && day.accentColor
                ? {
                    backgroundColor: day.accentColor,
                    boxShadow: day.accentMuted
                      ? '0 0 10px rgba(255,255,255,0.08)'
                      : '0 0 18px rgba(255,255,255,0.12)',
                    filter: day.accentMuted ? 'saturate(0.86)' : undefined,
                  }
                : undefined;

            return (
              <div
                key={day.date}
                className={cn('aspect-square', isWeekend && 'opacity-[0.12]')}
                style={{
                  gridColumnStart: weekIndex + 2,
                  gridRowStart: day.dayIndex + 2,
                }}
                title={
                  showTooltips
                    ? `${formatDateLabel(day.date)}: ${getContributionText(
                        day.count,
                        day.label
                      )}`
                    : undefined
                }
              >
                <motion.div
                  animate={{
                    opacity: day.inYear
                      ? isActive
                        ? day.accentMuted
                          ? 0.9
                          : 1
                        : isFriday
                          ? 0.18
                          : 0.12
                      : 0.08,
                    scale: isActive ? 1.02 : 0.86,
                  }}
                  transition={
                    reducedMotion
                      ? { duration: 0 }
                      : { duration: 0.28, ease: 'easeOut' }
                  }
                  className={cn(
                    'h-full w-full rounded-[3px]',
                    getLevelClassName(day.level, day.inYear),
                    isFriday && !isActive && day.inYear && 'bg-white/[0.055]',
                    isActive &&
                      !day.accentColor &&
                      'shadow-[0_0_18px_rgba(94,106,210,0.24)]'
                  )}
                  style={activeCellStyle}
                />
              </div>
            );
          })}
        </div>
      </div>

      {showLegend ? (
        <div className='mt-4 flex items-center justify-end gap-2 text-[11px] text-white/40'>
          <span>Less</span>
          <div className='flex items-center gap-1'>
            {LEVELS.map(level => (
              <span
                key={level}
                className={cn(
                  'h-3 w-3 rounded-[3px]',
                  getLevelClassName(level, true)
                )}
              />
            ))}
          </div>
          <span>More</span>
        </div>
      ) : null}
    </div>
  );
}

export default ContributionGraph;
