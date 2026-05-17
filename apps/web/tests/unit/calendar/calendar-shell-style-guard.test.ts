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
});
