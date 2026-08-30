import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DrawerBackButton } from './DrawerBackButton';

describe('DrawerBackButton', () => {
  it('keeps the back label as the accessible name and invokes navigation', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(<DrawerBackButton label='Back to artist' onClick={onClick} />);

    const button = screen.getByRole('button', { name: 'Back to artist' });
    expect(button.querySelector('[aria-hidden="true"]')).not.toBeNull();

    await user.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
