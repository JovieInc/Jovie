import { Button } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { Artist } from '@/types/db';
import { ArtistThemeProvider, useArtistTheme } from './ArtistThemeProvider';

const hoisted = vi.hoisted(() => ({
  setTheme: vi.fn(),
  resolvedTheme: 'dark' as string | undefined,
  saveTheme: vi.fn(),
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({
    setTheme: hoisted.setTheme,
    resolvedTheme: hoisted.resolvedTheme,
  }),
}));

vi.mock('@/lib/queries/useArtistThemeMutation', () => ({
  useArtistThemeMutation: () => ({ mutate: hoisted.saveTheme }),
}));

const ARTIST = { id: 'artist-1', handle: 'tim', name: 'Tim White' } as Artist;

function ThemeControls() {
  const { theme, resolvedTheme, isCustomTheme, setTheme } = useArtistTheme();
  return (
    <div>
      <p>
        Theme {theme} · resolved {resolvedTheme} ·{' '}
        {isCustomTheme ? 'custom' : 'default'}
      </p>
      <Button type='button' onClick={() => setTheme('light')}>
        Use light
      </Button>
      <Button type='button' onClick={() => setTheme('auto')}>
        Use auto
      </Button>
    </div>
  );
}

describe('ArtistThemeProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.resolvedTheme = 'dark';
  });

  it('starts on auto with no artist preference', async () => {
    const { container } = render(
      <ArtistThemeProvider artist={ARTIST}>
        <ThemeControls />
      </ArtistThemeProvider>
    );

    expect(
      screen.getByText('Theme auto · resolved dark · default')
    ).toBeInTheDocument();
    expect(hoisted.setTheme).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('applies the artist saved mode to the system theme', async () => {
    const { container } = render(
      <ArtistThemeProvider
        artist={{ ...ARTIST, theme: { mode: 'light' } } as unknown as Artist}
      >
        <ThemeControls />
      </ArtistThemeProvider>
    );

    expect(await screen.findByText(/Theme light/)).toHaveTextContent('custom');
    expect(hoisted.setTheme).toHaveBeenCalledWith('light');
    await expectNoA11yViolations(container);
  });

  it('saves a chosen theme and maps auto to the system theme', async () => {
    const user = userEvent.setup();
    render(
      <ArtistThemeProvider artist={ARTIST}>
        <ThemeControls />
      </ArtistThemeProvider>
    );

    await user.click(screen.getByRole('button', { name: 'Use light' }));
    expect(hoisted.setTheme).toHaveBeenLastCalledWith('light');
    expect(hoisted.saveTheme).toHaveBeenLastCalledWith({
      artistId: 'artist-1',
      theme: 'light',
    });
    expect(screen.getByText(/Theme light/)).toHaveTextContent('custom');

    await user.click(screen.getByRole('button', { name: 'Use auto' }));
    expect(hoisted.setTheme).toHaveBeenLastCalledWith('system');
    expect(hoisted.saveTheme).toHaveBeenLastCalledWith({
      artistId: 'artist-1',
      theme: 'auto',
    });
  });

  it('falls back to light while the system theme is unresolved', () => {
    hoisted.resolvedTheme = undefined;
    render(
      <ArtistThemeProvider artist={ARTIST}>
        <ThemeControls />
      </ArtistThemeProvider>
    );

    expect(screen.getByText(/resolved light/)).toBeInTheDocument();
  });

  it('throws when the hook is used outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<ThemeControls />)).toThrow(
      'useArtistTheme must be used within an ArtistThemeProvider'
    );
    spy.mockRestore();
  });

  it('keeps long and Arabic children axe-clean', async () => {
    const longCopy =
      'Profile content for an artist with a very long biography that keeps going across every release, tour and collaboration.';
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ArtistThemeProvider artist={ARTIST}>
          <p>{longCopy}</p>
          <p>محتوى الملف الشخصي</p>
        </ArtistThemeProvider>
      </div>
    );

    expect(screen.getByText(longCopy)).toBeInTheDocument();
    expect(screen.getByText('محتوى الملف الشخصي')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
