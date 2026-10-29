import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import CalendarInner from '@/components/atoms/CalendarInner';

describe('CalendarInner label-in-name (JOV-8873)', () => {
  it('names day buttons with the visible day number as a whole word', () => {
    render(<CalendarInner month={new Date(2026, 0, 1)} />);

    const january15 = screen
      .getAllByRole('button')
      .find(button => button.textContent === '15');
    expect(january15).toBeDefined();

    // react-day-picker's stock label is the ordinal form ("15th January
    // 2026"), which fails axe label-content-name-mismatch against the
    // visible "15". The wrapper strips the ordinal so the visible number
    // appears in the accessible name as a whole word.
    const name = january15?.getAttribute('aria-label') ?? '';
    expect(name).toMatch(/\b15\b/);
    expect(name).not.toMatch(/15th/);
  });
});
