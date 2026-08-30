import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DrawerButton } from './DrawerButton';

describe('DrawerButton', () => {
  it('supports keyboard and pointer activation while preserving disabled semantics', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    const { rerender } = render(
      <>
        <DrawerButton onClick={onClick}>Save changes</DrawerButton>
        <DrawerButton disabled>Saving changes</DrawerButton>
      </>
    );

    const save = screen.getByRole('button', { name: 'Save changes' });
    const saving = screen.getByRole('button', { name: 'Saving changes' });
    expect(saving).toBeDisabled();

    await user.tab();
    expect(save).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledOnce();

    await user.click(save);
    expect(onClick).toHaveBeenCalledTimes(2);
    await user.click(saving);
    expect(onClick).toHaveBeenCalledTimes(2);

    rerender(
      <DrawerButton size='icon' aria-label='Open settings'>
        Settings
      </DrawerButton>
    );
    expect(
      screen.getByRole('button', { name: 'Open settings' })
    ).toBeInTheDocument();
  });
});
