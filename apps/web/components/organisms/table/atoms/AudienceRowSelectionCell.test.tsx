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

    const checkbox = screen.getByRole('checkbox', { name: 'Select Ada' });
    expect(checkbox.parentElement).toHaveClass(
      'opacity-0',
      'group-focus-within:opacity-100'
    );
    expect(screen.getByText('3')).toHaveClass('group-focus-within:opacity-0');
    await user.click(checkbox);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
