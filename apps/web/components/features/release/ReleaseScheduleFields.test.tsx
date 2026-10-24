import { render, screen } from '@testing-library/react';
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

import { formatDatePickerValue } from '@/components/molecules/DatePicker';
import { RELEASE_SCHEDULING_COPY } from '@/data/releaseSchedulingCopy';
import { ReleaseScheduleFields } from './ReleaseScheduleFields';

describe('ReleaseScheduleFields', () => {
  it('shows the release form dates and stores a new release date', async () => {
    const user = userEvent.setup();
    render(<ReleaseScheduleFields />);

    expect(
      screen.getByText(RELEASE_SCHEDULING_COPY.fields.releaseDate)
    ).toBeVisible();
    expect(
      screen.getByText(RELEASE_SCHEDULING_COPY.fields.revealDate)
    ).toBeVisible();
    expect(
      screen.getByText(RELEASE_SCHEDULING_COPY.fields.revealHelp)
    ).toBeVisible();

    const releaseDate = formatDatePickerValue(
      RELEASE_SCHEDULING_COPY.fixture.releaseDate
    );
    const revealDate = formatDatePickerValue(
      RELEASE_SCHEDULING_COPY.fixture.revealDate
    );
    const releaseTrigger = screen.getByRole('button', {
      name: RELEASE_SCHEDULING_COPY.fields.releaseDate,
    });
    const revealTrigger = screen.getByRole('button', {
      name: RELEASE_SCHEDULING_COPY.fields.revealDate,
    });
    expect(releaseTrigger).toHaveTextContent(releaseDate);
    expect(revealTrigger).toHaveTextContent(revealDate);

    await user.click(releaseTrigger);
    await user.click(screen.getByTestId('calendar-select-date'));

    expect(releaseTrigger).toHaveTextContent('May 20, 2030');
    expect(revealTrigger).toHaveTextContent(revealDate);
  });
});
