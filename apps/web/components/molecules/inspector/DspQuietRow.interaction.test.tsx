import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DspQuietRow } from './DspQuietRow';

const providers = [
  { label: 'Deezer', url: 'https://www.deezer.com/album/123' },
  { label: 'Spotify', url: 'https://open.spotify.com/album/123' },
  { label: 'Apple Music', url: 'https://music.apple.com/album/123' },
];

// Destination-row interaction contract (JOV-8955, extended 2026-11-09):
// a linked destination row keeps its data order, uniform geometry, and one
// reserved trailing control — now the action menu (Open / Copy link / …),
// never a bare open-link icon — plus an optional hover preview card.
describe('Destinations row invariant (JOV-8955)', () => {
  it('preserves data order, labels, destinations and uniform row geometry', () => {
    render(
      <div>
        {providers.map(provider => (
          <DspQuietRow
            key={provider.label}
            label={provider.label}
            href={provider.url}
            icon={<span aria-hidden='true'>DSP</span>}
          />
        ))}
      </div>
    );

    const rows = screen.getAllByRole('link');
    expect(rows).toHaveLength(providers.length);
    rows.forEach((row, index) => {
      expect(row).toHaveAccessibleName(providers[index].label);
      expect(row).toHaveAttribute('href', providers[index].url);
      // The row keeps its flex-1 track inside the wrapper; the wrapper owns
      // the shared row geometry (height, inset, group hover surface).
      expect(row).toHaveClass('flex', 'min-w-0', 'flex-1', 'items-center');
      const wrapper = row.parentElement;
      expect(wrapper).toHaveClass(
        'group',
        'flex',
        'min-h-8',
        'px-0',
        'items-center'
      );
      expect(within(row).getByText(providers[index].label)).toHaveClass(
        'flex-1',
        'min-w-0',
        'truncate',
        'text-xs'
      );
      // The trailing control is the action menu, last in the row, its slot
      // reserved by opacity at rest — never a layout-shifting swap.
      const menu = wrapper?.lastElementChild;
      expect(menu?.querySelector('svg')).not.toBeNull();
      const triggerClass = menu?.getAttribute('class') ?? '';
      expect(triggerClass).toContain('shrink-0');
      expect(triggerClass).toContain('opacity-0');
      expect(triggerClass).toContain('group-hover:opacity-100');
      expect(triggerClass).toContain('group-focus-within:opacity-100');
      // The control itself never hides (its slot is reserved via opacity);
      // the canonical 44px hit-target pseudo may position absolutely.
      expect(triggerClass).not.toMatch(
        /(?:^|\s)(?:hidden|invisible|absolute)(?:\s|$)/
      );
    });
  });

  it('keeps the whole row keyboard accessible and reserves the menu slot through hover and focus', async () => {
    const user = userEvent.setup();
    render(
      <DspQuietRow
        label='Spotify'
        href={providers[1].url}
        icon={<span aria-hidden='true'>DSP</span>}
      />
    );
    const row = screen.getByRole('link', { name: 'Spotify' });
    const menu = row.parentElement?.lastElementChild;
    const restClasses = menu?.getAttribute('class');
    await user.hover(row);
    expect(menu?.getAttribute('class')).toBe(restClasses);
    await user.unhover(row);
    await user.tab();
    expect(row).toHaveFocus();
    expect(menu?.getAttribute('class')).toBe(restClasses);
    await user.tab();
    expect(
      screen.getByRole('button', { name: 'Destination actions for Spotify' })
    );
    expect(row).not.toHaveFocus();
    expect(menu?.getAttribute('class')).toBe(restClasses);
  });

  it('removes closed inspector rows from keyboard navigation', async () => {
    const user = userEvent.setup();
    render(
      <DspQuietRow
        label='Spotify'
        href={providers[1].url}
        icon={null}
        closedTabIndex={-1}
      />
    );
    await user.tab();
    expect(screen.getByRole('link')).not.toHaveFocus();
    // The action menu stays in the DOM (like the link) but is pulled from
    // the tab order with the row.
    expect(
      screen
        .getByRole('button', { name: 'Destination actions for Spotify' })
        .getAttribute('tabindex')
    ).toBe('-1');
  });

  it('carries the destination action menu: Open, Copy link, Copy Jovie link, Copy platform URI', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    render(
      <DspQuietRow
        label='Spotify'
        href='https://open.spotify.com/album/abc123'
        icon={<span aria-hidden='true'>DSP</span>}
        jovieLinkUrl='https://jov.ie/tim/seaside-heights?utm_source=spotify&utm_medium=work-inspector'
      />
    );

    // Radix closes the menu after each selection, so each copy re-opens it.
    await user.click(
      screen.getByRole('button', { name: 'Destination actions for Spotify' })
    );

    const names = screen
      .getAllByRole('menuitem')
      .map(item => item.textContent?.trim());
    expect(names).toEqual([
      'Open',
      'Copy link',
      'Copy Jovie link with UTM',
      'Copy platform URI',
    ]);
    expect(screen.queryByRole('menuitem', { name: 'Open' })).toBeEnabled();

    await user.click(screen.getByRole('menuitem', { name: 'Copy link' }));
    expect(writeText).toHaveBeenCalledWith(
      'https://open.spotify.com/album/abc123'
    );

    await user.click(
      screen.getByRole('button', { name: 'Destination actions for Spotify' })
    );
    await user.click(
      screen.getByRole('menuitem', { name: 'Copy platform URI' })
    );
    expect(writeText).toHaveBeenCalledWith('spotify:album:abc123');

    await user.click(
      screen.getByRole('button', { name: 'Destination actions for Spotify' })
    );
    await user.click(
      screen.getByRole('menuitem', { name: 'Copy Jovie link with UTM' })
    );
    expect(writeText).toHaveBeenCalledWith(
      'https://jov.ie/tim/seaside-heights?utm_source=spotify&utm_medium=work-inspector'
    );
  });

  it('offers only Open and Copy link when the network has no native URI and no Jovie link is given', async () => {
    const user = userEvent.setup();
    render(
      <DspQuietRow
        label='Apple Music'
        href={providers[2].url}
        icon={<span aria-hidden='true'>DSP</span>}
      />
    );

    await user.click(
      screen.getByRole('button', {
        name: 'Destination actions for Apple Music',
      })
    );

    const names = screen
      .getAllByRole('menuitem')
      .map(item => item.textContent?.trim());
    expect(names).toEqual(['Open', 'Copy link']);
  });

  it('previews the item on a hover card rendered from the row anchor', async () => {
    const user = userEvent.setup();
    render(
      <DspQuietRow
        label='Spotify'
        href={providers[1].url}
        icon={<span aria-hidden='true'>DSP</span>}
        entity={{
          kind: 'release',
          id: 'seaside-heights',
          label: 'Seaside Heights',
          artist: 'Vigel',
        }}
      />
    );

    const row = screen.getByRole('link', { name: 'Spotify' });
    await user.hover(row);
    // The hover bridge delays ~200ms so a cursor sweep across the list
    // doesn't flash a card per row.
    const card = await screen.findByRole('tooltip', {}, { timeout: 2000 });
    expect(card).toHaveTextContent('Seaside Heights');
    expect(card).toHaveTextContent('Vigel');
    // The preview anchors to the row and renders LEFT of it via the shared
    // EntityPopover collision logic (the inspector hugs the window's right
    // edge, so the left side is the only one that fits).
    await waitFor(() =>
      expect(row.parentElement).toHaveAttribute(
        'data-destination-preview',
        'true'
      )
    );

    await user.unhover(row);
    await waitFor(() =>
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    );
  });

  it('does not preview when no entity summary is provided', () => {
    render(
      <DspQuietRow
        label='Spotify'
        href={providers[1].url}
        icon={<span aria-hidden='true'>DSP</span>}
      />
    );
    expect(
      screen.getByRole('link', { name: 'Spotify' }).parentElement
    ).not.toHaveAttribute('data-destination-preview');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
