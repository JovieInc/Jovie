/** Resolve a venue wall time without relying on the server's default timezone. */
export function resolveEventLocalStart(
  localStart: string,
  timezone: string
): Date | null {
  if (
    !/^[1-9]\d{3}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localStart) ||
    !/^[a-z]/i.test(timezone)
  ) {
    return null;
  }

  const wallTime = new Date(`${localStart}:00.000Z`);
  if (
    Number.isNaN(wallTime.getTime()) ||
    wallTime.toISOString().slice(0, 16) !== localStart
  ) {
    return null;
  }

  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en', {
      timeZone: timezone,
      timeZoneName: 'longOffset',
    });
  } catch {
    return null;
  }

  function offsetAt(instant: number): number {
    const label = formatter
      .formatToParts(instant)
      .find(part => part.type === 'timeZoneName')?.value;
    if (label === 'GMT') return 0;
    const match = /^GMT([+-])(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(label ?? '');
    if (!match) return NaN;
    const [, sign, hours, minutes, seconds] = match;
    const offset =
      (Number(hours) * 3_600 + Number(minutes) * 60 + Number(seconds ?? 0)) *
      1_000;
    return sign === '-' ? -offset : offset;
  }

  const wallMs = wallTime.getTime();
  const dayMs = 86_400_000;
  // Check the offsets on both sides of a possible clock change. Skipped and
  // repeated wall times cannot identify one instant and require a new time.
  const offsets = new Set([
    offsetAt(wallMs - dayMs),
    offsetAt(wallMs),
    offsetAt(wallMs + dayMs),
  ]);
  const candidates = [...offsets]
    .filter(Number.isFinite)
    .map(offset => ({ instant: wallMs - offset, offset }))
    .filter(({ instant, offset }) => offsetAt(instant) === offset);
  return candidates.length === 1 ? new Date(candidates[0].instant) : null;
}
