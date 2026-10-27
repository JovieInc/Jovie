import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { DrawerEditableTextField } from './DrawerEditableTextField';

it.each(['ISRC', 'UPC', 'Label'])(
  'reserves %s copy controls and retains copy feedback after pointer exit',
  async label => {
    const user = userEvent.setup();
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue();
    render(
      <DrawerEditableTextField
        label={label}
        value='Example'
        copyValue='Example'
      />
    );
    const button = screen.getByRole('button', { name: `Copy ${label}` });
    const slot = button.parentElement;
    expect(slot).toHaveClass(
      'shrink-0',
      'opacity-0',
      'group-focus-within:opacity-100'
    );
    await user.tab();
    expect(button).toHaveFocus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Example'));
    await waitFor(() => expect(slot).toHaveClass('opacity-100'));
    await user.tab();
    expect(slot).toHaveClass('opacity-100');
    expect(button.parentElement).toBe(slot);
    writeText.mockRestore();
  }
);

it('preserves the action group through keyboard edit cancellation and restores its actions', async () => {
  const user = userEvent.setup();
  const onSave = vi.fn();
  const onAction = vi.fn();
  const { container } = render(
    <DrawerEditableTextField
      label='Label'
      value='Original'
      editable
      onSave={onSave}
      actions={[
        { id: 'inspect', ariaLabel: 'Inspect Label', onClick: onAction },
      ]}
    />
  );
  const action = screen.getByRole('button', { name: 'Inspect Label' });
  const slot = action.parentElement;
  expect(slot).toBe(container.firstElementChild?.lastElementChild);
  expect(slot).toHaveAttribute(
    'data-slot',
    'drawer-editable-text-field-actions'
  );
  expect(slot?.children).toHaveLength(2);

  await user.tab();
  expect(screen.getByRole('button', { name: /Edit Label/ })).toHaveFocus();
  await user.keyboard('{Enter}');
  const input = screen.getByRole('textbox', { name: 'Edit Label' });
  expect(input).toHaveFocus();
  await user.type(input, 'Unsaved');
  expect(container.firstElementChild?.lastElementChild).toBe(slot);
  expect(slot).toHaveAttribute('aria-hidden', 'true');
  expect(slot?.children).toHaveLength(2);
  expect(screen.queryByRole('button', { name: 'Inspect Label' })).toBeNull();

  await user.keyboard('{Escape}');
  expect(onSave).not.toHaveBeenCalled();
  expect(screen.getByText('Original')).toBeInTheDocument();
  expect(container.firstElementChild?.lastElementChild).toBe(slot);
  expect(slot).not.toHaveAttribute('aria-hidden');
  const restored = screen.getByRole('button', { name: 'Inspect Label' });
  expect(restored.parentElement).toBe(slot);
  await user.tab();
  await user.tab();
  await user.tab();
  expect(restored).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(onAction).toHaveBeenCalledOnce();
  expect(screen.queryByRole('textbox')).toBeNull();
});
