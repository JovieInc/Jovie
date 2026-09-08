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
});
