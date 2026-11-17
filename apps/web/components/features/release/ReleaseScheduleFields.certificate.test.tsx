import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/atoms/Calendar', () => ({
  Calendar: ({ onSelect }: { onSelect?: (date: Date | undefined) => void }) => (
    <button
      type='button'
      data-testid='calendar-select-date'
      onClick={() => onSelect?.(new Date('2030-06-02T12:00:00.000Z'))}
    >
      Select June 2 2030
    </button>
  ),
}));

import { formatDatePickerValue } from '@/components/molecules/DatePicker';
import { RELEASE_SCHEDULING_COPY } from '@/data/releaseSchedulingCopy';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ReleaseScheduleFields } from './ReleaseScheduleFields';

const { fields, fixture } = RELEASE_SCHEDULING_COPY;

describe('ReleaseScheduleFields certificate', () => {
  it('labels both date pickers and stays axe-clean', async () => {
    const { container } = render(<ReleaseScheduleFields />);

    expect(
      screen.getByRole('button', { name: fields.releaseDate })
    ).toHaveTextContent(formatDatePickerValue(fixture.releaseDate));
    expect(
      screen.getByRole('button', { name: fields.revealDate })
    ).toHaveTextContent(formatDatePickerValue(fixture.revealDate));
    await expectNoA11yViolations(container);
  });

  it('stores a new reveal date without touching the release date, in RTL', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ReleaseScheduleFields />
      </div>
    );

    const releaseTrigger = screen.getByRole('button', {
      name: fields.releaseDate,
    });
    const revealTrigger = screen.getByRole('button', {
      name: fields.revealDate,
    });
    await user.click(revealTrigger);
    await user.click(screen.getByTestId('calendar-select-date'));

    expect(revealTrigger).toHaveTextContent('Jun 2, 2030');
    expect(releaseTrigger).toHaveTextContent(
      formatDatePickerValue(fixture.releaseDate)
    );
    await expectNoA11yViolations(container);
  });
});
