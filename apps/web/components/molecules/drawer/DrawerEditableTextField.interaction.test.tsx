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
    expect(slot?.tagName).toBe('DIV');
    expect(slot).toHaveAttribute(
      'data-slot',
      'drawer-editable-text-field-actions'
    );
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
