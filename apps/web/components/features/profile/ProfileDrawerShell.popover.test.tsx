import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProfileDrawerShell } from './ProfileDrawerShell';

describe('ProfileDrawerShell anchored popover', () => {
  it('renders a compact popover (not a sheet) when an anchor is provided', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    render(
      <ProfileDrawerShell
        open
        onOpenChange={vi.fn()}
        title='Menu'
        anchorRef={{ current: trigger }}
        dataTestId='profile-menu-drawer'
      >
        <button type='button'>Share</button>
      </ProfileDrawerShell>
    );

    expect(screen.getByTestId('profile-menu-drawer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
    expect(
      screen.queryByTestId('profile-drawer-overlay')
    ).not.toBeInTheDocument();
    trigger.remove();
  });

  it('closes on Escape', async () => {
    const onOpenChange = vi.fn();
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    render(
      <ProfileDrawerShell
        open
        onOpenChange={onOpenChange}
        title='Menu'
        anchorRef={{ current: trigger }}
      >
        <button type='button'>Share</button>
      </ProfileDrawerShell>
    );
    await userEvent.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
    trigger.remove();
  });
});
