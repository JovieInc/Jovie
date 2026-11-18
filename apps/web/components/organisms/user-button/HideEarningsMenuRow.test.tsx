import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  HIDE_EARNINGS_LABEL,
  HideEarningsMenuRow,
  hideEarningsAccessibleName,
} from './HideEarningsMenuRow';

function renderRow(hidden: boolean) {
  return render(
    <div role='menu'>
      <div
        role='menuitem'
        tabIndex={0}
        aria-label={hideEarningsAccessibleName(hidden)}
      >
        <HideEarningsMenuRow hidden={hidden} />
      </div>
    </div>
  );
}

describe('HideEarningsMenuRow', () => {
  it.each([
    [false, 'false', 'unchecked', 'Hide Earnings, Off'],
    [true, 'true', 'checked', 'Hide Earnings, On'],
  ])(
    'shows hidden=%s on the switch and in the accessible name',
    async (hidden, ariaChecked, state, name) => {
      const { container } = renderRow(hidden);
      // The visible label never flips; the switch carries the state.
      expect(screen.getByText(HIDE_EARNINGS_LABEL)).toHaveClass(
        'flex-1',
        'truncate'
      );
      const toggle = container.querySelector('[role="switch"]');
      expect(toggle).toHaveAttribute('aria-checked', ariaChecked);
      expect(toggle).toHaveAttribute('data-state', state);
      expect(screen.getByRole('menuitem', { name })).toBeInTheDocument();
      await expectNoA11yViolations(container);
    }
  );

  it('keeps the switch display-only: the row is the one control', () => {
    const { container } = renderRow(false);
    const toggle = container.querySelector('[role="switch"]');
    expect(toggle).toHaveAttribute('aria-hidden', 'true');
    expect(toggle).toHaveAttribute('tabindex', '-1');
    expect(toggle).toHaveClass('pointer-events-none');
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('uses the shared icon column and a right-aligned trailing slot', () => {
    const { container } = renderRow(false);
    const icon = container.querySelector('svg') as SVGElement;
    expect(icon).toHaveClass('h-4', 'w-4');
    expect(icon.parentElement).toHaveClass('h-4', 'w-4', 'shrink-0');
    expect(
      container.querySelector('[role="switch"]')?.parentElement
    ).toHaveClass('ms-auto');
  });
});
