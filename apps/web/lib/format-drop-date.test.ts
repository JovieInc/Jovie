import { describe, expect, it } from 'vitest';
import { dropDateMeta } from './format-drop-date';

const NOW = new Date('2026-04-25T12:00:00Z');

describe('dropDateMeta', () => {
  it('returns Today for the same calendar day with soon tone', () => {
    expect(dropDateMeta('2026-04-25T18:00:00Z', NOW)).toEqual({
      label: 'Today',
      tone: 'soon',
    });
  });

  it('returns Yesterday for ‑1 day with past tone', () => {
    expect(dropDateMeta('2026-04-24T12:00:00Z', NOW)).toEqual({
      label: 'Yesterday',
      tone: 'past',
    });
  });

  it('returns Tomorrow for +1 day with soon tone', () => {
    expect(dropDateMeta('2026-04-26T12:00:00Z', NOW)).toEqual({
      label: 'Tomorrow',
      tone: 'soon',
    });
  });

  it('formats past beyond yesterday as Nd ago with past tone', () => {
    expect(dropDateMeta('2026-04-22T12:00:00Z', NOW)).toEqual({
      label: '3d ago',
      tone: 'past',
    });
  });

  it('formats inside-a-week future as Drops in Nd with soon tone', () => {
    expect(dropDateMeta('2026-04-30T12:00:00Z', NOW)).toEqual({
      label: 'Drops in 5d',
      tone: 'soon',
    });
  });

  it('formats inside-a-month future as Drops in Nd with future tone', () => {
    expect(dropDateMeta('2026-05-15T12:00:00Z', NOW)).toEqual({
      label: 'Drops in 20d',
      tone: 'future',
    });
  });

  it('falls back to localised absolute date past a month', () => {
    const out = dropDateMeta('2026-07-01T12:00:00Z', NOW);
    expect(out.tone).toBe('future');
    expect(out.label).toMatch(/^Drops Jul/);
  });

  it('returns empty label with future tone for invalid date input', () => {
    expect(dropDateMeta('not-a-date', NOW)).toEqual({
      label: '',
      tone: 'future',
    });
  });
});
