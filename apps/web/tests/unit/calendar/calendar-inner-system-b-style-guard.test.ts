import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../..');
const CALENDAR_INNER = join(ROOT, 'components/atoms/CalendarInner.tsx');

describe('CalendarInner System B style guard', () => {
  it('keeps calendar selection and focus states neutral', () => {
    const source = readFileSync(CALENDAR_INNER, 'utf8');

    expect(source).not.toMatch(/\bbg-accent\b/);
    expect(source).not.toMatch(/\btext-accent-foreground\b/);
    expect(source).not.toMatch(/\bhover:bg-accent\b/);
    expect(source).not.toMatch(/\bfocus-visible:ring-accent\b/);
    expect(source).not.toMatch(/\btext-accent\b/);
    expect(source).toContain('[&>button]:bg-btn-primary');
    expect(source).toContain('[&>button]:text-btn-primary-foreground');
    expect(source).toContain('[&>button]:hover:bg-btn-primary-hover');
    expect(source).toContain('focus-visible:ring-ring');
  });

  it('preserves stable calendar control dimensions across visual states', () => {
    const source = readFileSync(CALENDAR_INNER, 'utf8');

    expect(source).toContain('inline-flex h-6 w-6');
    expect(source).toContain("day: 'h-8 w-8 p-0 text-center'");
    expect(source).toContain('inline-flex h-8 w-8');
  });
});
