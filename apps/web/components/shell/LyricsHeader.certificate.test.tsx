import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { LyricsHeader } from './LyricsHeader';

describe('LyricsHeader certificate', () => {
  it('fires onArtistClick from the artist link, axe-clean', async () => {
    const user = userEvent.setup();
    const onArtistClick = vi.fn();
    const { container } = render(
      <LyricsHeader
        track={{ artist: 'Bahamas', title: 'Lost in the Light' }}
        onArtistClick={onArtistClick}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Bahamas' }));
    expect(onArtistClick).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Lost in the Light')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('labels a missing artist as Unknown artist on the link', async () => {
    const user = userEvent.setup();
    const onArtistClick = vi.fn();
    render(
      <LyricsHeader
        track={{ artist: '', title: 'Skyline Dreams' }}
        onArtistClick={onArtistClick}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Unknown artist' }));
    expect(onArtistClick).toHaveBeenCalledTimes(1);
  });

  it('renders a plain-text artist with no handler, axe-clean', async () => {
    const { container } = render(
      <LyricsHeader track={{ artist: 'Bahamas', title: 'Lost in the Light' }} />
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Bahamas')).toHaveClass('truncate');
    await expectNoA11yViolations(container);
  });

  it('keeps long and RTL breadcrumbs axe-clean', async () => {
    const title =
      'A Song Title So Long It Needs To Truncate Inside The Sticky Header';
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <LyricsHeader
          track={{ artist: 'فيروز', title }}
          onArtistClick={vi.fn()}
        />
      </div>
    );
    expect(screen.getByText(title)).toHaveClass('truncate');
    expect(screen.getByRole('button', { name: 'فيروز' })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
