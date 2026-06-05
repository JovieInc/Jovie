import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../..');
const CALENDAR_CLIENT = join(
  ROOT,
  'app/app/(shell)/calendar/CalendarPageClient.tsx'
);

const CHROME_CLASS_PATTERN = /(?:^|\s)(?:uppercase|tracking-[^\s'"]+)/;
const LABEL_ELEMENT_PATTERN =
  /<(?:h3|h4|span)\b[\s\S]*?className=(?:'[^']*'|"[^"]*"|\{[^}]*\})[\s\S]*?>/g;
const ROUTE_LOCAL_VISUAL_PATTERN =
  /(?:--linear-|color-mix\(|(?:bg|text|border|accent|ring|from|via|to|decoration)-(?:blue|sky|indigo|purple|violet|cyan|emerald|green|red|rose|pink|amber|yellow|orange|teal)-[^\s'"]+|(?:bg|text|border)-\[[^\]]+\]|(?:min-[hw]|max-[hw]|w|h)-\[[^\]]+\]|(?:bg|text)-quaternary-token\/\d+)/;
const NAMED_COLOR_OWNER_PATTERN =
  /className=(?:'[^']*\bsystem-b-calendar-(?:provider-chip|row-description|row-secondary)\b[^']*\btext-(?:tertiary-token|quaternary-token)\b[^']*'|"[^"]*\bsystem-b-calendar-(?:provider-chip|row-description|row-secondary)\b[^"]*\btext-(?:tertiary-token|quaternary-token)\b[^"]*")/g;

function lineNumberFor(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

describe('calendar shell style guard', () => {
  it('keeps panel headings and badges off uppercase/tracking chrome', () => {
    const source = readFileSync(CALENDAR_CLIENT, 'utf8');
    const offenders: string[] = [];

    for (const match of source.matchAll(LABEL_ELEMENT_PATTERN)) {
      if (!CHROME_CLASS_PATTERN.test(match[0])) continue;
      offenders.push(
        `CalendarPageClient.tsx:${lineNumberFor(source, match.index ?? 0)} ${match[0].replace(/\s+/g, ' ').trim()}`
      );
    }

    expect(
      offenders,
      `Calendar panel headings and badges should use quiet shell text styles.\n${offenders.join('\n')}`
    ).toEqual([]);
  });

  it('allows compact weekday header labels to remain distinct from panel chrome', () => {
    const source = readFileSync(CALENDAR_CLIENT, 'utf8');

    expect(source).toContain('DAY_NAMES.map');
  });

  it('keeps route-local calendar chrome on named System B classes', () => {
    const source = readFileSync(CALENDAR_CLIENT, 'utf8');
    const offenders = source
      .split('\n')
      .map((line, index) => ({ line, lineNumber: index + 1 }))
      .filter(({ line }) => ROUTE_LOCAL_VISUAL_PATTERN.test(line))
      .map(
        ({ line, lineNumber }) =>
          `CalendarPageClient.tsx:${lineNumber} ${line.trim()}`
      );

    expect(source).toContain('system-b-calendar-day-cell');
    expect(
      offenders,
      `Calendar visual chrome should use named system-b-calendar-* classes instead of legacy Linear variables, color-mix(), arbitrary color utilities, or hardcoded accent utilities.\n${offenders.join('\n')}`
    ).toEqual([]);
  });

  it('lets named detail metadata classes own their text color', () => {
    const source = readFileSync(CALENDAR_CLIENT, 'utf8');
    const offenders = [...source.matchAll(NAMED_COLOR_OWNER_PATTERN)].map(
      match =>
        `CalendarPageClient.tsx:${lineNumberFor(source, match.index ?? 0)} ${match[0].replace(/\s+/g, ' ').trim()}`
    );

    expect(
      offenders,
      `Calendar detail metadata classes should not carry duplicate route-local text color utilities.\n${offenders.join('\n')}`
    ).toEqual([]);
  });
});
