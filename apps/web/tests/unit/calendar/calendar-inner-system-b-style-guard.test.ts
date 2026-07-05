import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../..');
const CALENDAR_INNER = join(ROOT, 'components/atoms/CalendarInner.tsx');
const TAILWIND_CONFIG = join(ROOT, 'tailwind.config.js');

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

  it('maps calendar neutral utilities to concrete Tailwind tokens', () => {
    const tailwindConfig = readFileSync(TAILWIND_CONFIG, 'utf8');

    expect(tailwindConfig).toContain(
      "'btn-primary-hover': 'var(--color-btn-primary-hover)'"
    );
    expect(tailwindConfig).toContain("ring: 'var(--linear-border-focus)'");
  });

  it('preserves stable calendar control dimensions across visual states', () => {
    const source = readFileSync(CALENDAR_INNER, 'utf8');

    expect(source).toContain('inline-flex h-6 w-6');
    expect(source).toContain("day: 'h-8 w-8 p-0 text-center'");
    expect(source).toContain('inline-flex h-8 w-8');
    expect(source).toContain(
      'hover:bg-interactive-hover hover:text-primary-token transition-colors'
    );
    expect(source).toContain('hover:bg-interactive-hover transition-colors');
    expect(source).toContain(
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
    );
    expect(source).toContain('[&>button]:font-medium');
    expect(source).toContain('[&>button]:text-primary-token');
    expect(source).toContain('[&>button]:text-tertiary-token');
    expect(source).toContain('[&>button]:opacity-50');
    expect(source).toContain('[&>button]:opacity-40');
  });
});
