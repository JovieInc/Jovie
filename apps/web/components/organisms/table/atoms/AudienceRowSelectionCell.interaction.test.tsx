import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { AudienceRowSelectionCell } from './AudienceRowSelectionCell';

it('swaps the fixed row-number slot on keyboard focus and preserves selected visibility', async () => {
  const onToggle = vi.fn();
  const { rerender } = render(
    <AudienceRowSelectionCell
      rowNumber={3}
      isChecked={false}
      displayName='Ada'
      onToggle={onToggle}
    />
  );
  const checkbox = screen.getByRole('checkbox', { name: 'Select Ada' });
  expect(screen.getByText('3')).toHaveClass('group-focus-within:opacity-0');
  expect(checkbox.parentElement).toHaveClass(
    'absolute',
    'inset-0',
    'group-focus-within:opacity-100'
  );
  await userEvent.tab();
  await userEvent.keyboard(' ');
  expect(onToggle).toHaveBeenCalledOnce();
  rerender(
    <AudienceRowSelectionCell
      rowNumber={3}
      isChecked
      displayName='Ada'
      onToggle={onToggle}
    />
  );
  expect(checkbox.parentElement).toHaveClass('opacity-100');
  expect(screen.getByText('3')).toHaveClass('opacity-0');
});
