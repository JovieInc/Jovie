import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DrawerHero } from './DrawerHero';

describe('DrawerHero', () => {
  it('renders the title', () => {
    render(<DrawerHero title='Lost in the Light' />);
    expect(screen.getByText('Lost in the Light')).toBeInTheDocument();
  });

  it('renders subtitle when provided', () => {
    render(<DrawerHero title='Lost in the Light' subtitle='Bahamas' />);
    expect(screen.getByText('Bahamas')).toBeInTheDocument();
  });

  it('does not clamp the subtitle by default outside stable layout', () => {
    render(<DrawerHero title='Lost in the Light' subtitle='Bahamas' />);
    expect(screen.getByText('Bahamas')).not.toHaveClass('line-clamp-1');
  });

  it('uses truncate for one-line stable subtitles without changing child layout display', () => {
    render(
      <DrawerHero title='Lost in the Light' subtitle='Bahamas' stableLayout />
    );
    expect(screen.getByText('Bahamas')).toHaveClass('truncate');
    expect(screen.getByText('Bahamas')).not.toHaveClass('line-clamp-1');
  });

  it('renders the menu button only when onMenu is provided', () => {
    const a = render(<DrawerHero title='Test' />);
    expect(a.queryByLabelText('Drawer actions')).toBeNull();
    a.unmount();

    const b = render(<DrawerHero title='Test' onMenu={() => {}} />);
    expect(b.getByLabelText('Drawer actions')).toBeInTheDocument();
  });

  it('wraps artwork in a play button when onPlay is provided', () => {
    const onPlay = vi.fn();
    render(
      <DrawerHero
        title='Test'
        artwork={<div data-testid='art' />}
        onPlay={onPlay}
        playLabel='Play test track'
      />
    );
    fireEvent.click(screen.getByLabelText('Play test track'));
    expect(onPlay).toHaveBeenCalledOnce();
  });

  it('renders artwork as plain element when onPlay is omitted', () => {
    const { container } = render(
      <DrawerHero title='Test' artwork={<div data-testid='art' />} />
    );
    expect(
      container.querySelectorAll('button[aria-label^="Play"]').length
    ).toBe(0);
  });

  it('renders status badge + meta + trailing slots', () => {
    render(
      <DrawerHero
        title='Test'
        statusBadge={<span data-testid='status'>LIVE</span>}
        meta={<span data-testid='meta'>chip</span>}
        trailing={<span data-testid='trailing'>link</span>}
      />
    );
    expect(screen.getByTestId('status')).toBeInTheDocument();
    expect(screen.getByTestId('meta')).toBeInTheDocument();
    expect(screen.getByTestId('trailing')).toBeInTheDocument();
  });

  it('reserves stable subtitle and metadata slots when optional data is missing', () => {
    render(<DrawerHero title='Test' stableLayout />);

    expect(screen.getByRole('heading', { name: 'Test' })).toHaveClass(
      'line-clamp-2',
      'min-h-[44px]'
    );
    expect(screen.getByTestId('drawer-hero-subtitle-slot')).toHaveClass(
      'invisible',
      'min-h-[16px]'
    );
    expect(screen.getByTestId('drawer-hero-meta-slot')).toHaveClass(
      'invisible'
    );
  });

  it('keeps stable metadata in a single horizontal rail', () => {
    render(
      <DrawerHero
        title='Test'
        stableLayout
        meta={
          <>
            <span>Scheduled</span>
            <span>Single</span>
            <span>Spotify</span>
          </>
        }
      />
    );

    const rail = screen.getByTestId('drawer-hero-meta-slot').firstElementChild;
    expect(rail).toHaveClass('overflow-x-auto', 'whitespace-nowrap');
  });
});
