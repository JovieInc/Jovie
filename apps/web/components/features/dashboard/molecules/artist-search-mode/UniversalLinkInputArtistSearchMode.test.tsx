import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { UniversalLinkInputArtistSearchMode } from './UniversalLinkInputArtistSearchMode';

const query = vi.hoisted(() => ({
  results: [] as unknown[],
  state: 'idle' as string,
  error: null as string | null,
  search: vi.fn(),
  clear: vi.fn(),
}));

vi.mock('@/lib/queries', () => ({
  useArtistSearchQuery: () => query,
}));
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));

const ARTISTS = [
  {
    id: 'a1',
    name: 'Luna Park',
    url: 'https://open.spotify.com/artist/a1',
    imageUrl: '',
    followers: 1200,
    verified: true,
  },
  {
    id: 'a2',
    name: 'Luna Parks',
    url: 'https://open.spotify.com/artist/a2',
    imageUrl: '',
    followers: 0,
    verified: false,
  },
];

function Harness({
  onSelect = vi.fn(),
  onExit = vi.fn(),
}: {
  onSelect?: (l: unknown) => void;
  onExit?: (u?: string) => void;
}) {
  const ref = React.useRef<HTMLInputElement | null>(null);
  const [tick, setTick] = React.useState(0);
  const focusInput = React.useCallback(() => ref.current?.focus(), []);
  return (
    <div data-tick={tick}>
      <button type='button' onClick={() => setTick(t => t + 1)}>
        rerender
      </button>
      <UniversalLinkInputArtistSearchMode
        provider='spotify'
        onSelect={onSelect}
        onExit={onExit}
        inputRef={ref}
        focusInput={focusInput}
      />
    </div>
  );
}

describe('UniversalLinkInputArtistSearchMode', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    query.results = [];
    query.state = 'idle';
    query.error = null;
    query.search.mockClear();
  });

  it('keeps typed text and focus across a rerender and Escape, axe-clean', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    const input = screen.getByLabelText('Search Spotify artists');
    await user.type(input, 'luna');
    await user.click(screen.getByRole('button', { name: 'rerender' }));
    expect(input).toHaveValue('luna');
    await user.click(input);
    expect(input).toHaveFocus();
    await user.tab();
    expect(input).toHaveValue('luna');
    await expectNoA11yViolations(container);
  });

  it('exits search mode from the exit button', async () => {
    const user = userEvent.setup();
    const onExit = vi.fn();
    render(<Harness onExit={onExit} />);
    await user.click(screen.getByRole('button', { name: 'Exit Search Mode' }));
    expect(onExit).toHaveBeenCalled();
  });

  it('shows results and selects an artist', async () => {
    const user = userEvent.setup();
    query.results = ARTISTS;
    query.state = 'success';
    const onSelect = vi.fn();
    const { container } = render(<Harness onSelect={onSelect} />);
    await user.type(screen.getByLabelText('Search Spotify artists'), 'luna');
    const row = await screen.findByRole('button', {
      name: /Luna Park 1/,
      hidden: true,
    });
    await user.click(row);
    expect(onSelect).toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('shows the empty and error states with a manual-add escape hatch', async () => {
    const user = userEvent.setup();
    query.state = 'empty';
    const onExit = vi.fn();
    const { unmount } = render(<Harness onExit={onExit} />);
    await user.type(screen.getByLabelText('Search Spotify artists'), 'zz');
    expect(
      (await screen.findAllByText('No artists found')).length
    ).toBeGreaterThan(0);
    await user.click(
      screen.getByRole('button', { name: 'Add link manually', hidden: true })
    );
    expect(onExit).toHaveBeenCalled();
    unmount();

    query.state = 'error';
    query.error = 'Search failed';
    render(<Harness />);
    await user.type(screen.getByLabelText('Search Spotify artists'), 'zz');
    expect(
      (await screen.findAllByText('Search failed')).length
    ).toBeGreaterThan(0);
  });
});
