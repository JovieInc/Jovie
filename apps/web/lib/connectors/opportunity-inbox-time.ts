const RELATIVE_TIME_FORMATTER = new Intl.RelativeTimeFormat('en', {
  numeric: 'auto',
});

const TIME_UNITS: ReadonlyArray<{
  readonly amount: number;
  readonly unit: Intl.RelativeTimeFormatUnit;
}> = [
  { amount: 60, unit: 'second' },
  { amount: 60, unit: 'minute' },
  { amount: 24, unit: 'hour' },
  { amount: 7, unit: 'day' },
  { amount: 4.34524, unit: 'week' },
  { amount: 12, unit: 'month' },
  { amount: Number.POSITIVE_INFINITY, unit: 'year' },
];

export function formatOpportunityInboxRelativeTime(
  isoTimestamp: string,
  now = Date.now()
): string {
  const timestamp = Date.parse(isoTimestamp);
  if (!Number.isFinite(timestamp)) {
    return 'Recently';
  }

  let deltaSeconds = Math.round((timestamp - now) / 1000);
  if (deltaSeconds === 0) {
    return 'Just now';
  }

  for (const { amount, unit } of TIME_UNITS) {
    if (Math.abs(deltaSeconds) < amount) {
      return RELATIVE_TIME_FORMATTER.format(deltaSeconds, unit);
    }
    deltaSeconds = Math.round(deltaSeconds / amount);
  }

  return 'Recently';
}
