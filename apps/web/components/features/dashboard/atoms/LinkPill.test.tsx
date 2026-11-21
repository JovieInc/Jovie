import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { LinkPill, type LinkPillProps } from './LinkPill';

function Harness(props: Partial<LinkPillProps> & { onSelect?: () => void }) {
  const [open, setOpen] = useState(false);
  const { onSelect = vi.fn(), ...rest } = props;
  return (
    <LinkPill
      platformIcon='spotify'
      platformName='Spotify'
      primaryText='Spotify'
      secondaryText='artist.spotify.com/1'
      state='connected'
      menuId='t1'
      isMenuOpen={open}
      onMenuOpenChange={setOpen}
      menuItems={[
        { id: 'edit', label: 'Edit', onSelect },
        { id: 'remove', label: 'Remove', variant: 'destructive', onSelect },
      ]}
      {...rest}
    />
  );
}

describe('LinkPill', () => {
  it('renders the pill and a closed actions button axe-clean', async () => {
    const { container } = render(<Harness />);
    expect(screen.getByTestId('link-pill-t1')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Open actions for Spotify' })
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('opens the menu, runs an item and closes', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    await user.click(
      screen.getByRole('button', { name: 'Open actions for Spotify' })
    );
    const menu = await screen.findByRole('menu');
    expect(menu).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes the menu on Escape', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(
      screen.getByRole('button', { name: 'Open actions for Spotify' })
    );
    await screen.findByRole('menu');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('renders an empty menu without items', async () => {
    const user = userEvent.setup();
    render(<Harness menuItems={[]} />);
    await user.click(
      screen.getByRole('button', { name: 'Open actions for Spotify' })
    );
    expect(await screen.findByRole('menu')).toBeVisible();
    expect(screen.queryAllByRole('button', { name: 'Edit' })).toHaveLength(0);
  });
});

// Drift T2.1: IconButton alias retirement — callsite migration coverage.
describe('LinkPill IconButton trigger', () => {
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
