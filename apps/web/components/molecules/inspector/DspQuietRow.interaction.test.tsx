import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DspQuietRow } from './DspQuietRow';

const providers = [
  { label: 'Deezer', url: 'https://www.deezer.com/album/123' },
  { label: 'Spotify', url: 'https://open.spotify.com/album/123' },
  { label: 'Apple Music', url: 'https://music.apple.com/album/123' },
];

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
      expect(row).toHaveClass(
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
      const icon = row.querySelector('svg');
      expect(icon).toHaveAttribute('aria-hidden', 'true');
      // Opacity keeps the trailing icon's slot in flex layout at rest.
      expect(icon).toHaveClass(
        'h-3',
        'w-3',
        'shrink-0',
        'opacity-0',
        'group-hover:opacity-100',
        'group-focus-within:opacity-100'
      );
      expect(icon).toBe(row.lastElementChild);
      expect(icon?.classList).not.toContain('opacity-100');
      expect(icon?.getAttribute('class')).not.toMatch(
        /(?:^|\s)(?:\S+:)?(?:hidden|invisible|absolute)(?:\s|$)/
      );
    });
  });

  it('keeps the whole row keyboard accessible and reserves the icon through hover and focus', async () => {
    const user = userEvent.setup();
    render(
      <DspQuietRow
        label='Spotify'
        href={providers[1].url}
        icon={<span aria-hidden='true'>DSP</span>}
      />
    );
    const row = screen.getByRole('link', { name: 'Spotify' });
    const icon = row.querySelector('svg');
    const restClasses = icon?.getAttribute('class');
    await user.hover(row);
    expect(icon?.getAttribute('class')).toBe(restClasses);
    await user.unhover(row);
    await user.tab();
    expect(row).toHaveFocus();
    expect(icon?.getAttribute('class')).toBe(restClasses);
    await user.tab();
    expect(row).not.toHaveFocus();
    expect(icon?.getAttribute('class')).toBe(restClasses);
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
  });
});
