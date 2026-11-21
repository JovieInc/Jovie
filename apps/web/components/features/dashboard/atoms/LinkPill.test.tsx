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

  it('keeps the overflow glyph at 20px under IconButton lg', () => {
    render(
      <LinkPill
        platformIcon='spotify'
        platformName='Spotify'
        primaryText='spotify.com/artist'
        state='connected'
        menuId='pill-size'
        isMenuOpen={false}
        menuItems={[{ id: 'edit', label: 'Edit', onSelect: vi.fn() }]}
        onMenuOpenChange={vi.fn()}
      />
    );
    const button = screen.getByRole('button', {
      name: 'Open actions for Spotify',
    });
    expect(button.className).toMatch(/h-10|icon-lg/);
    const svg = button.querySelector('svg');
    const svgClass = svg?.getAttribute('class') ?? '';
    expect(svgClass).toMatch(/h-5/);
    expect(svgClass).toMatch(/w-5/);
  });
});
