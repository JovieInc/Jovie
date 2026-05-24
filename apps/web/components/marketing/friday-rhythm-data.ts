import type { ContributionData } from '@/components/ui/contribution-graph.types';

export type { ContributionData } from '@/components/ui/contribution-graph.types';

export const FRIDAY_RHYTHM_YEAR = 2026;
export const INITIAL_ACTIVE_FRIDAYS = 3;

export const FRIDAY_RELEASE_KINDS = [
  {
    key: 'new-single',
    label: 'New Single',
    accentColor: '#2fcf7f',
    level: 4,
    muted: false,
  },
  {
    key: 'merch-drop',
    label: 'Merch Drop',
    accentColor: '#7c5cff',
    level: 4,
    muted: false,
  },
  {
    key: 'remix',
    label: 'Remix',
    accentColor: '#22a99a',
    level: 3,
    muted: true,
  },
  {
    key: 'video',
    label: 'Video',
    accentColor: '#2f80d8',
    level: 3,
    muted: true,
  },
  {
    key: 'tour-recap',
    label: 'Tour Recap',
    accentColor: '#c04494',
    level: 2,
    muted: true,
  },
] as const;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;
const FRIDAY_INDEX = 5;
const INITIAL_FRIDAY_ANCHOR_RATIOS = [0.1, 0.5, 0.9] as const;
const RELEASE_KIND_SEQUENCE = [0, 2, 1, 3, 0, 4, 2, 1, 0, 3, 4, 1] as const;

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function getDaysInMonth(year: number, monthIndex: number): number {
  if (monthIndex === 1 && isLeapYear(year)) return 29;
  return DAYS_IN_MONTH[monthIndex] ?? 30;
}

function padDatePart(value: number): string {
  return value.toString().padStart(2, '0');
}

export function formatDateKey(
  year: number,
  monthIndex: number,
  day: number
): string {
  return `${year}-${padDatePart(monthIndex + 1)}-${padDatePart(day)}`;
}

export function getWeekdayIndex(
  year: number,
  monthIndex: number,
  day: number
): number {
  return new Date(Date.UTC(year, monthIndex, day)).getUTCDay();
}

export function isFridayDateKey(dateKey: string): boolean {
  const [yearPart, monthPart, dayPart] = dateKey.split('-').map(Number);

  if (!yearPart || !monthPart || !dayPart) return false;

  return getWeekdayIndex(yearPart, monthPart - 1, dayPart) === FRIDAY_INDEX;
}

export function countFridaysInYear(year: number): number {
  let fridayCount = 0;

  for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
    for (let day = 1; day <= getDaysInMonth(year, monthIndex); day += 1) {
      if (getWeekdayIndex(year, monthIndex, day) === FRIDAY_INDEX) {
        fridayCount += 1;
      }
    }
  }

  return fridayCount;
}

function getFridayDatesInYear(year: number): string[] {
  const fridayDates: string[] = [];

  for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
    for (let day = 1; day <= getDaysInMonth(year, monthIndex); day += 1) {
      if (getWeekdayIndex(year, monthIndex, day) === FRIDAY_INDEX) {
        fridayDates.push(formatDateKey(year, monthIndex, day));
      }
    }
  }

  return fridayDates;
}

function getInitialFridayAnchorIndexes(totalFridays: number): number[] {
  const anchors = new Set<number>();

  for (const ratio of INITIAL_FRIDAY_ANCHOR_RATIOS) {
    anchors.add(
      Math.min(
        Math.max(Math.round((totalFridays - 1) * ratio), 0),
        totalFridays - 1
      )
    );
  }

  return Array.from(anchors).sort((left, right) => left - right);
}

function getFridayActivationOrder(totalFridays: number): number[] {
  const initialAnchors = getInitialFridayAnchorIndexes(totalFridays);
  const remainingIndexes = Array.from(
    { length: totalFridays },
    (_, index) => index
  ).filter(index => !initialAnchors.includes(index));

  return [...initialAnchors, ...remainingIndexes];
}

function clampActiveFridayCount(
  year: number,
  activeFridayCount: number
): number {
  const totalFridays = countFridaysInYear(year);

  if (!Number.isFinite(activeFridayCount)) return 0;

  return Math.min(Math.max(Math.round(activeFridayCount), 0), totalFridays);
}

function getFridayReleaseKind(fridayIndex: number) {
  const sequenceIndex =
    RELEASE_KIND_SEQUENCE[fridayIndex % RELEASE_KIND_SEQUENCE.length] ?? 0;

  return FRIDAY_RELEASE_KINDS[sequenceIndex] ?? FRIDAY_RELEASE_KINDS[0];
}

export function generateFridayRhythmData(
  year: number,
  activeFridayCount: number
): ContributionData[] {
  const activeCount = clampActiveFridayCount(year, activeFridayCount);
  const fridayDates = getFridayDatesInYear(year);
  const fridayIndexByDate = new Map(
    fridayDates.map((date, index) => [date, index])
  );
  const activeFridayIndexes = new Set(
    getFridayActivationOrder(fridayDates.length).slice(0, activeCount)
  );
  const data: ContributionData[] = [];

  for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
    for (let day = 1; day <= getDaysInMonth(year, monthIndex); day += 1) {
      const date = formatDateKey(year, monthIndex, day);
      const isFriday = getWeekdayIndex(year, monthIndex, day) === FRIDAY_INDEX;
      const fridayIndex = fridayIndexByDate.get(date);
      const isActiveFriday =
        isFriday &&
        fridayIndex !== undefined &&
        activeFridayIndexes.has(fridayIndex);
      const releaseKind =
        isActiveFriday && fridayIndex !== undefined
          ? getFridayReleaseKind(fridayIndex)
          : undefined;

      data.push({
        date,
        count: isActiveFriday ? 1 : 0,
        level: releaseKind?.level ?? 0,
        accentColor: releaseKind?.accentColor,
        accentMuted: releaseKind?.muted,
        label: releaseKind?.label,
      });
    }
  }

  return data;
}
