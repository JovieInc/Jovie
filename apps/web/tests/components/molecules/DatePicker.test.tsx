import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/atoms/Calendar', () => ({
  Calendar: ({ onSelect }: { onSelect?: (date: Date | undefined) => void }) => (
    <button
      type='button'
      data-testid='calendar-select-date'
      onClick={() => onSelect?.(new Date('2030-05-20T12:00:00.000Z'))}
    >
      Select May 20 2030
    </button>
  ),
}));

import {
  DatePicker,
  formatDatePickerValue,
  parseDatePickerValue,
} from '@/components/molecules/DatePicker';

describe('parseDatePickerValue', () => {
  it('parses strict calendar dates as plain days', () => {
    const parsed = parseDatePickerValue('2030-05-20');
    expect(parsed).toBeInstanceOf(Date);
    expect(parsed?.getFullYear()).toBe(2030);
    expect(parsed?.getMonth()).toBe(4);
    expect(parsed?.getDate()).toBe(20);
  });

  it('falls back to lenient ISO parsing for datetime strings', () => {
    const parsed = parseDatePickerValue('2030-05-20T12:00:00.000Z');
    expect(parsed).toBeInstanceOf(Date);
    expect(parsed?.toISOString()).toBe('2030-05-20T12:00:00.000Z');
  });

  it('returns undefined for empty and invalid values', () => {
    expect(parseDatePickerValue('')).toBeUndefined();
    expect(parseDatePickerValue(null)).toBeUndefined();
    expect(parseDatePickerValue('not-a-date')).toBeUndefined();
    expect(parseDatePickerValue('2030-13-40')).toBeUndefined();
  });
});

describe('formatDatePickerValue', () => {
  it('formats a stored date for the trigger label', () => {
    expect(formatDatePickerValue('2030-05-20')).toBe('May 20, 2030');
  });

  it('falls back to the placeholder for empty or invalid values', () => {
    expect(formatDatePickerValue('')).toBe('Pick a date');
    expect(formatDatePickerValue('bogus')).toBe('Pick a date');
  });
});

describe('DatePicker', () => {
  it.each([false, true])(
    'keeps date selection usable with disablePortal=%s',
    async disablePortal => {
      const onChange = vi.fn();
      render(
        <aside aria-label='Release details'>
          <DatePicker
            id='date'
            value=''
            onChange={onChange}
            disablePortal={disablePortal}
          />
        </aside>
      );
      const drawer = screen.getByRole('complementary', {
        name: 'Release details',
      });
      await userEvent.click(
        within(drawer).getByRole('button', { name: 'Pick a date' })
      );
      const day = screen.getByTestId('calendar-select-date');
      expect(drawer.contains(day)).toBe(disablePortal);
      await userEvent.click(day);
      expect(onChange).toHaveBeenCalledExactlyOnceWith('2030-05-20');
    }
  );

  it('renders the placeholder on the canonical compact trigger', async () => {
    render(<DatePicker id='date' value='' onChange={vi.fn()} />);

    const trigger = screen.getByRole('button', { name: /Pick a date/ });
    expect(trigger).toBeInTheDocument();
    expect(trigger.className).toContain('h-8');
    expect(trigger.className).toContain('before:h-11');
    expect(trigger.className).toContain('rounded-lg');
    expect(trigger.className).toContain('text-tertiary-token');
    await userEvent.click(trigger);
    expect(screen.getByTestId('popover-content')).toHaveClass('w-auto');
    expect(screen.getByTestId('popover-content')).toHaveClass('p-0');
  });

  it('renders the formatted selected date', () => {
    render(<DatePicker id='date' value='2030-05-20' onChange={vi.fn()} />);

    const trigger = screen.getByRole('button', { name: 'May 20, 2030' });
    expect(trigger.className).not.toContain('text-tertiary-token');
  });

  it('honors the disabled state for pending forms', () => {
    render(<DatePicker id='date' value='' onChange={vi.fn()} disabled />);

    expect(screen.getByRole('button', { name: /Pick a date/ })).toBeDisabled();
  });

  it('emits yyyy-MM-dd when a day is selected', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DatePicker id='date' value='' onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Pick a date' }));
    await user.click(screen.getByTestId('calendar-select-date'));

    expect(onChange).toHaveBeenCalledWith('2030-05-20');
  });
});

describe('date picker consolidation', () => {
  const COMPONENTS = join(__dirname, '../../../components');
  const CONSUMERS = [
    'features/dashboard/organisms/release-provider-matrix/AddReleaseSidebar.tsx',
    'features/dashboard/organisms/tour-dates/TourDateSidebar.tsx',
  ];

  it('keeps every drawer date picker on the shared DatePicker molecule', () => {
    for (const consumer of CONSUMERS) {
      const source = readFileSync(join(COMPONENTS, consumer), 'utf8');
      // Red case: inlining the popover+Calendar pattern in a consumer means
      // the family has drifted off the consolidated component again.
      expect(source).not.toMatch(/<Calendar\b/);
      expect(source).toContain("from '@/components/molecules/DatePicker'");
    }
  });
});
