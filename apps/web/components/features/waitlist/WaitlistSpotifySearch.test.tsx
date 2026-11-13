import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArtistSearchState, SpotifyArtistResult } from '@/lib/queries';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { WaitlistSpotifySearch } from './WaitlistSpotifySearch';

const mockSearch = vi.fn();
const mockClear = vi.fn();
const mockHookReturn = {
  results: [] as SpotifyArtistResult[],
  state: 'idle' as ArtistSearchState,
  search: mockSearch,
  clear: mockClear,
};

vi.mock('@/lib/queries', () => ({
  useArtistSearchQuery: () => mockHookReturn,
}));

vi.mock('@/components/atoms/SocialIcon', () => ({
  SocialIcon: ({
    platform,
    className,
  }: {
    platform: string;
    className?: string;
  }) => <span data-testid={`social-icon-${platform}`} className={className} />,
}));

describe('WaitlistSpotifySearch', () => {
  beforeEach(() => {
    mockHookReturn.results = [];
    mockHookReturn.state = 'idle';
    vi.clearAllMocks();
  });

  it.each(['manual', 'selected'] as const)(
    'lets the %s mode switch grow while preserving its canonical minimum target',
    mode => {
      const onUrlChange = vi.fn();
      const onArtistNameChange = vi.fn();
      if (mode === 'selected') {
        mockHookReturn.results = [
          {
            id: 'example-artist',
            name: 'Example Artist',
            url: 'https://open.spotify.com/artist/example',
            popularity: 0,
          },
        ];
      }
      render(
        <WaitlistSpotifySearch
          spotifyUrl=''
          onUrlChange={onUrlChange}
          onArtistNameChange={onArtistNameChange}
          fieldErrors={{}}
          isSubmitting={false}
          isHydrating
          setInputRef={vi.fn()}
        />
      );

      fireEvent.change(screen.getByRole('combobox'), {
        target: { value: 'artist' },
      });
      if (mode === 'selected') {
        fireEvent.change(screen.getByLabelText('Spotify Artist Results'), {
          target: { value: 'example-artist' },
        });
      } else {
        fireEvent.click(
          screen.getByRole('button', {
            name: /Manually add URL Paste a Spotify artist link/,
          })
        );
      }

      const switchToSearch = screen.getByRole('button', {
        name: mode === 'selected' ? 'Change' : 'Search For Artist Instead',
      });
      expect(switchToSearch).toHaveClass(
        'h-auto',
        'min-h-7',
        'before:h-full',
        'before:min-h-11',
        'before:min-w-11'
      );
      expect(switchToSearch.className).not.toMatch(/(?:^|\s)h-7(?:\s|$)/);
      fireEvent.click(switchToSearch);
      expect(screen.getByRole('combobox')).toBeVisible();
      expect(onUrlChange).toHaveBeenLastCalledWith('');
      expect(onArtistNameChange).toHaveBeenLastCalledWith(null);
    }
  );

  it('accepts a Spotify link typed without https so the browser does not block the form', () => {
    render(
      <WaitlistSpotifySearch
        spotifyUrl='open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb'
        onUrlChange={vi.fn()}
        onArtistNameChange={vi.fn()}
        fieldErrors={{}}
        isSubmitting={false}
        isHydrating={false}
        setInputRef={vi.fn()}
      />
    );
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'artist' },
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: /Manually add URL Paste a Spotify artist link/,
      })
    );

    const link = screen.getByLabelText('Spotify link') as HTMLInputElement;
    expect(link).toHaveValue('open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb');
    expect(link.checkValidity()).toBe(true);
    expect(link).toHaveAttribute('inputmode', 'url');
  });

  it('renders search-failure text with the error token, not raw red-* (JOV-6773)', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'components/features/waitlist/WaitlistSpotifySearch.tsx'
      ),
      'utf8'
    );

    expect(source).not.toMatch(/\bred-\d/);
    expect(source).toContain('text-error');
  });

  const ARTISTS: SpotifyArtistResult[] = [
    {
      id: 'neon-harbor',
      name: 'Neon Harbor',
      url: 'https://open.spotify.com/artist/neon-harbor',
      popularity: 40,
      followers: 18_400,
      verified: true,
    },
    {
      id: 'neon-harbour',
      name: 'Neon Harbour',
      url: 'https://open.spotify.com/artist/neon-harbour',
      popularity: 10,
    },
  ];

  function renderSearch(
    props: Partial<Parameters<typeof WaitlistSpotifySearch>[0]> = {}
  ) {
    const element = (
      overrides: Partial<Parameters<typeof WaitlistSpotifySearch>[0]> = {}
    ) => (
      <WaitlistSpotifySearch
        spotifyUrl=''
        onUrlChange={vi.fn()}
        onArtistNameChange={vi.fn()}
        fieldErrors={{}}
        isSubmitting={false}
        isHydrating
        setInputRef={vi.fn()}
        {...props}
        {...overrides}
      />
    );
    const view = render(element());
    return {
      ...view,
      rerenderWith: (next = {}) => view.rerender(element(next)),
    };
  }

  it('moves through the results with the arrow keys and picks one with Enter', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    mockHookReturn.results = ARTISTS;
    mockHookReturn.state = 'success';
    const onUrlChange = vi.fn();
    const onArtistNameChange = vi.fn();
    const user = userEvent.setup();
    renderSearch({ onUrlChange, onArtistNameChange });

    const combobox = screen.getByRole('combobox');
    await user.type(combobox, 'neon');
    expect(mockSearch).toHaveBeenLastCalledWith('neon');
    expect(combobox).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Spotify Artist Results')).toHaveClass(
      'sr-only'
    );

    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(combobox).toHaveAttribute(
      'aria-activedescendant',
      'spotify-result-1'
    );
    // Check the result while the list is open. Enter selects the artist and
    // switches to the URL row, which replaces these buttons with the name.
    // The buttons are real keyboard-operable controls and must not sit in an
    // aria-hidden subtree (axe aria-hidden-focus).
    const resultButton = screen.getByRole('button', { name: /Neon Harbor/ });
    expect(resultButton.closest('.max-h-64')).not.toHaveAttribute(
      'aria-hidden'
    );

    await user.keyboard('{ArrowUp}{Enter}');
    expect(onUrlChange).toHaveBeenLastCalledWith(
      'https://open.spotify.com/artist/neon-harbor'
    );
    expect(onArtistNameChange).toHaveBeenLastCalledWith('Neon Harbor');
    expect(screen.getByText('Neon Harbor')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /Neon Harbor/ })
    ).not.toBeInTheDocument();
  });

  it('closes the results on Escape and keeps the typed query', async () => {
    mockHookReturn.state = 'empty';
    const user = userEvent.setup();
    renderSearch();
    const combobox = screen.getByRole('combobox');
    await user.type(combobox, 'zzz');
    expect(screen.getByText('No artists found')).toBeVisible();
    await user.keyboard('{Escape}');
    expect(screen.queryByText('No artists found')).toBeNull();
    expect(combobox).toHaveValue('zzz');
  });

  it('keeps the typed query and focus across a rerender, Escape and blur', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { rerenderWith } = renderSearch();
    const combobox = screen.getByRole('combobox');

    await user.type(combobox, 'Neon Har');
    expect(combobox).toHaveValue('Neon Har');

    rerenderWith({ fieldErrors: { spotifyUrl: ['Check the link.'] } });
    expect(screen.getByRole('combobox')).toBe(combobox);
    expect(combobox).toHaveValue('Neon Har');
    expect(combobox).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(combobox).toHaveValue('Neon Har');
    expect(combobox).toHaveFocus();

    fireEvent.blur(combobox);
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(combobox).toHaveValue('Neon Har');
    vi.useRealTimers();
  });

  it('clears the pending blur-hide timer on unmount so no deferred setState outlives teardown', () => {
    vi.useFakeTimers();
    try {
      const { unmount } = renderSearch();
      const combobox = screen.getByRole('combobox');

      fireEvent.change(combobox, { target: { value: 'a' } });
      fireEvent.blur(combobox);
      expect(vi.getTimerCount()).toBeGreaterThan(0);

      unmount();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps a typed link across a rerender in link mode', async () => {
    const user = userEvent.setup();
    let url = '';
    const onUrlChange = vi.fn((next: string) => {
      url = next;
    });
    const { rerenderWith } = renderSearch({ onUrlChange });
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'a' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Manually add URL/ }));
    const link = screen.getByLabelText('Spotify link');
    await user.type(link, 'x');
    rerenderWith({ spotifyUrl: url, onUrlChange });
    expect(screen.getByLabelText('Spotify link')).toBe(link);
    expect(link).toHaveValue('x');
  });

  it.each([
    ['idle', [], 'idle'],
    ['loading', [], 'loading'],
    ['results', ARTISTS, 'success'],
    ['empty', [], 'empty'],
    ['error', [], 'error'],
  ] as const)(
    'has no axe violations in the %s search state',
    async (_label, results, state) => {
      mockHookReturn.results = [...results];
      mockHookReturn.state = state;
      const { container } = renderSearch();
      fireEvent.change(screen.getByRole('combobox'), {
        target: { value: 'neon' },
      });
      await expectNoA11yViolations(container);
    }
  );

  it('has no axe violations in link mode, with a picked artist and with a field error', async () => {
    mockHookReturn.results = ARTISTS;
    mockHookReturn.state = 'success';
    for (const props of [
      { spotifyUrl: 'https://open.spotify.com/artist/x' },
      { fieldErrors: { spotifyUrl: ['Enter a Spotify artist link.'] } },
      { isSubmitting: true },
    ]) {
      const { container, unmount } = renderSearch(props);
      fireEvent.change(screen.getByRole('combobox'), {
        target: { value: 'neon' },
      });
      fireEvent.change(screen.getByLabelText('Spotify Artist Results'), {
        target: { value: props.isSubmitting ? '__manual__' : 'neon-harbor' },
      });
      await expectNoA11yViolations(container);
      unmount();
    }
  });

  it('has no axe violations in a right-to-left page', async () => {
    mockHookReturn.results = ARTISTS;
    mockHookReturn.state = 'success';
    const { container } = render(
      <div dir='rtl'>
        <WaitlistSpotifySearch
          spotifyUrl=''
          onUrlChange={vi.fn()}
          onArtistNameChange={vi.fn()}
          fieldErrors={{}}
          isSubmitting={false}
          isHydrating
          setInputRef={vi.fn()}
        />
      </div>
    );
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'نيون' },
    });
    await expectNoA11yViolations(container);
  });
});
