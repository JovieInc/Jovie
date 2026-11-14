import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AudienceRowSelectionCell } from './AudienceRowSelectionCell';

describe('AudienceRowSelectionCell certificate', () => {
  it('toggles by keyboard without the click reaching the row', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    // Stands in for the table row that owns the cell: clicks and keys that
    // bubble out of the render root would reach it.
    const onRowClick = vi.fn();
    document.body.addEventListener('click', onRowClick);
    document.body.addEventListener('keydown', onRowClick);
    const { container } = render(
      <AudienceRowSelectionCell
        rowNumber={4}
        isChecked={false}
        displayName='Ada'
        onToggle={onToggle}
      />
    );

    const checkbox = screen.getByRole('checkbox', { name: 'Select Ada' });
    expect(checkbox).not.toBeChecked();
    checkbox.focus();
    await user.keyboard(' ');
    expect(onToggle).toHaveBeenCalledTimes(1);
    fireEvent.click(checkbox);
    expect(onToggle).toHaveBeenCalledTimes(2);
    document.body.removeEventListener('click', onRowClick);
    document.body.removeEventListener('keydown', onRowClick);
    expect(onRowClick).not.toHaveBeenCalled();
    expect(screen.getByText('4')).toHaveAttribute('aria-hidden', 'true');
    await expectNoA11yViolations(container);
  });

  it('labels a nameless member generically and reflects the checked state', async () => {
    const { container } = render(
      <AudienceRowSelectionCell
        rowNumber={1}
        isChecked
        displayName={null}
        onToggle={vi.fn()}
      />
    );

    expect(screen.getByRole('checkbox', { name: 'Select row' })).toBeChecked();
    expect(screen.getByText('1')).toHaveClass('opacity-0');
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean with a long row number in an RTL document', async () => {
    const { container } = render(
      <div dir='rtl'>
        <AudienceRowSelectionCell
          rowNumber={10_482}
          isChecked={false}
          displayName='ليلى'
          onToggle={vi.fn()}
        />
      </div>
    );

    expect(screen.getByRole('checkbox', { name: 'Select ليلى' })).toBeVisible();
    expect(screen.getByText('10482')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
