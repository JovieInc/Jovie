import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { Calendar } from './Calendar';

const JANUARY = new Date(2026, 0, 1, 12);
// The first test pays for the code-split CalendarInner import; give it room on
// a loaded runner instead of the 1s findBy default.
const CHUNK_WAIT = { timeout: 8000 };
const CHUNK_TEST_TIMEOUT = 15_000;

describe('Calendar', () => {
  it(
    'holds a hidden fixed-height placeholder while the chunk loads, then paints the grid',
    async () => {
      const { container } = render(
        <Calendar mode='single' defaultMonth={JANUARY} />
      );

      const placeholder = container.querySelector('div.h-64');
      expect(placeholder).not.toBeNull();
      expect(placeholder).toHaveAttribute('aria-hidden');
      expect(placeholder).toBeEmptyDOMElement();
      expect(screen.queryByRole('grid')).toBeNull();

      expect(
        await screen.findByRole('grid', {}, CHUNK_WAIT)
      ).toBeInTheDocument();
      expect(container.querySelector('div.h-64[aria-hidden]')).toBeNull();
      await expectNoA11yViolations(container);
    },
    CHUNK_TEST_TIMEOUT
  );

  it(
    'passes a picked day through to onSelect',
    async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      const { container } = render(
        <Calendar mode='single' defaultMonth={JANUARY} onSelect={onSelect} />
      );

      await user.click(
        await screen.findByRole('button', { name: /January 15/ }, CHUNK_WAIT)
      );
      expect(onSelect).toHaveBeenCalledTimes(1);
      const picked = onSelect.mock.calls[0][0] as Date;
      expect(picked.getFullYear()).toBe(2026);
      expect(picked.getMonth()).toBe(0);
      expect(picked.getDate()).toBe(15);
      await expectNoA11yViolations(container);
    },
    CHUNK_TEST_TIMEOUT
  );

  it(
    'keeps disabled days out of reach and stays axe-clean in RTL',
    async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      const { container } = render(
        <div dir='rtl' lang='ar'>
          <Calendar
            mode='single'
            dir='rtl'
            defaultMonth={JANUARY}
            disabled={{ before: new Date(2026, 0, 10, 12) }}
            onSelect={onSelect}
          />
        </div>
      );

      const disabledDay = await screen.findByRole(
        'button',
        { name: /January 5/ },
        CHUNK_WAIT
      );
      expect(disabledDay).toBeDisabled();
      await user.click(disabledDay);
      expect(onSelect).not.toHaveBeenCalled();
      await expectNoA11yViolations(container);
    },
    CHUNK_TEST_TIMEOUT
  );
});
