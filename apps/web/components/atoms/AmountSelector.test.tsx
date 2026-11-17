import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AmountSelector } from './AmountSelector';

describe('AmountSelector', () => {
  it('reports its own index when pressed and exposes the pressed state', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(
      <AmountSelector amount={10} index={2} isSelected onClick={onClick} />
    );

    const tile = screen.getByRole('button', { name: 'Select $10 tip amount' });
    expect(tile).toHaveAttribute('type', 'button');
    expect(tile).toHaveAttribute('aria-pressed', 'true');
    expect(tile).toHaveAttribute('data-selected', 'true');
    expect(tile).toHaveTextContent('$10');

    await user.click(tile);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith(2);
    await expectNoA11yViolations(container);
  });

  it('selects from the keyboard and keeps an unselected tile unpressed', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(
      <AmountSelector
        amount={5}
        index={0}
        isSelected={false}
        onClick={onClick}
        ariaLabel='Tip five dollars'
      />
    );

    const tile = screen.getByRole('button', { name: 'Tip five dollars' });
    expect(tile).toHaveAttribute('aria-pressed', 'false');
    expect(tile).toHaveAttribute('data-selected', 'false');

    await user.tab();
    expect(tile).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledWith(0);
    await expectNoA11yViolations(container);
  });

  it('ignores presses while disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(
      <AmountSelector
        amount={20}
        index={1}
        isSelected={false}
        onClick={onClick}
        disabled
      />
    );

    const tile = screen.getByRole('button', { name: 'Select $20 tip amount' });
    expect(tile).toBeDisabled();
    expect(tile).toHaveAttribute('aria-disabled', 'true');

    await user.click(tile);
    expect(onClick).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('keeps a long amount and a right-to-left row axe-clean', async () => {
    const { container } = render(
      <div dir='rtl'>
        <AmountSelector amount={10000} index={0} isSelected onClick={vi.fn()} />
      </div>
    );

    expect(
      screen.getByRole('button', { name: 'Select $10000 tip amount' })
    ).toHaveTextContent('$10000');
    await expectNoA11yViolations(container);
  });
});
