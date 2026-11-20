// Drift T2.1: IconButton alias retirement — callsite migration coverage.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LinkPill } from './LinkPill';

describe('LinkPill', () => {
  it('opens the overflow menu from the IconButton', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onMenuOpenChange = vi.fn();
    render(
      <LinkPill
        platformIcon='spotify'
        platformName='Spotify'
        primaryText='spotify.com/artist'
        state='connected'
        menuId='pill-1'
        isMenuOpen={false}
        menuItems={[{ id: 'edit', label: 'Edit', onSelect }]}
        onMenuOpenChange={onMenuOpenChange}
      />
    );
    await user.click(screen.getByRole('button'));
    expect(onMenuOpenChange).toHaveBeenCalledWith(true);
  });
});
