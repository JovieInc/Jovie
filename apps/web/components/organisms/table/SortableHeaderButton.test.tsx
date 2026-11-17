import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SortableHeaderButton } from './SortableHeaderButton';

describe('SortableHeaderButton', () => {
  it('calls onClick once per activation by mouse and keyboard', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(
      <SortableHeaderButton label='Release Date' onClick={onClick} />
    );

    const button = screen.getByRole('button', { name: 'Release Date' });
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);

    button.focus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(2);
    await expectNoA11yViolations(container);
  });

  it.each([
    [undefined, '⇅'],
    ['asc', '▴'],
    ['desc', '▾'],
  ] as const)(
    'shows the %s indicator as decorative text',
    async (direction, glyph) => {
      const { container } = render(
        <SortableHeaderButton
          label='Title'
          direction={direction}
          onClick={vi.fn()}
        />
      );

      const indicator = screen.getByText(glyph);
      expect(indicator).toHaveAttribute('aria-hidden', 'true');
      // The indicator never leaks into the accessible name.
      expect(screen.getByRole('button', { name: 'Title' })).toBeInTheDocument();
      await expectNoA11yViolations(container);
    }
  );

  it('keeps a long label in a truncating span and an RTL label readable', async () => {
    const { container } = render(
      <div dir='rtl'>
        <SortableHeaderButton
          label='تاريخ الإصدار الأحدث عبر كل المزودين'
          direction='asc'
          onClick={vi.fn()}
          className='custom-header'
        />
      </div>
    );

    const button = screen.getByRole('button', {
      name: 'تاريخ الإصدار الأحدث عبر كل المزودين',
    });
    expect(button).toHaveClass('custom-header');
    expect(
      screen.getByText('تاريخ الإصدار الأحدث عبر كل المزودين')
    ).toHaveClass('truncate');
    await expectNoA11yViolations(container);
  });
});
