import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AudienceRowSelectionCell } from './AudienceRowSelectionCell';

describe('AudienceRowSelectionCell', () => {
  it('toggles the nested checkbox without requiring the wrapper to be a button', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();

    render(
      <AudienceRowSelectionCell
        rowNumber={3}
        isChecked={false}
        displayName='Ada'
        onToggle={onToggle}
      />
    );

    await user.click(screen.getByRole('checkbox', { name: 'Select Ada' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('shows the row number only when one is given', () => {
    const { container, rerender } = render(
      <AudienceRowSelectionCell
        rowNumber={7}
        isChecked={false}
        displayName='Ada'
        onToggle={vi.fn()}
      />
    );
    expect(screen.getByText('7')).toBeInTheDocument();

    rerender(
      <AudienceRowSelectionCell
        isChecked={false}
        displayName='Ada'
        onToggle={vi.fn()}
      />
    );
    expect(screen.queryByText('7')).not.toBeInTheDocument();
    expect(container.querySelector('.tabular-nums')).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Select Ada' })).toBeVisible();
  });

  it('reveals the checkbox on keyboard focus without a row number', () => {
    const { container } = render(
      <AudienceRowSelectionCell
        isChecked={false}
        displayName='Ada'
        onToggle={vi.fn()}
      />
    );
    expect(container.innerHTML).toContain('focus-within:opacity-100');
  });
});
