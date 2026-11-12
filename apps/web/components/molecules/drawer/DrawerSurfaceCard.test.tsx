import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DrawerSurfaceCard } from './DrawerSurfaceCard';

describe('DrawerSurfaceCard', () => {
  it('renders a flat surface by default', async () => {
    const { container } = render(
      <DrawerSurfaceCard testId='surface'>Drawer surface</DrawerSurfaceCard>
    );

    const surface = screen.getByTestId('surface');
    expect(surface).toHaveAttribute('data-variant', 'flat');
    expect(surface).toHaveClass('border-0', 'bg-transparent', 'shadow-none');
    await expectNoA11yViolations(container);
  });

  it('renders the card variant as a semantic busy section', async () => {
    const ref = createRef<HTMLElement>();
    const { container } = render(
      <DrawerSurfaceCard
        ref={ref}
        as='section'
        aria-label='Analytics'
        aria-busy
        variant='card'
        data-right-rail-section='analytics'
        testId='surface'
      >
        Loading analytics…
      </DrawerSurfaceCard>
    );

    const surface = screen.getByRole('region', { name: 'Analytics' });
    expect(surface).toBe(ref.current);
    expect(surface).toHaveAttribute('data-surface-variant', 'card');
    expect(surface).toHaveAttribute('data-right-rail-section', 'analytics');
    expect(surface).toHaveAttribute('aria-busy', 'true');
    await expectNoA11yViolations(container);
  });

  it('forwards DOM handlers to the rendered element', async () => {
    const onClick = vi.fn();
    const { container } = render(
      <DrawerSurfaceCard testId='surface' onClick={onClick}>
        <p>Clickable surface</p>
      </DrawerSurfaceCard>
    );

    fireEvent.click(screen.getByText('Clickable surface'));
    expect(onClick).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });

  it('wraps long content inside the card', async () => {
    const text =
      'Spotify, Apple Music, YouTube Music, Tidal, Deezer, Amazon Music, SoundCloud, Beatport, Bandcamp and Audiomack links appear in this drawer card once the catalog sync finishes.';
    const { container } = render(
      <DrawerSurfaceCard variant='card' testId='surface'>
        {text}
      </DrawerSurfaceCard>
    );

    expect(screen.getByTestId('surface')).toHaveTextContent(text);
    expect(screen.getByTestId('surface').className).not.toMatch(
      /truncate|whitespace-nowrap/
    );
    await expectNoA11yViolations(container);
  });

  it('renders in a right-to-left drawer', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <DrawerSurfaceCard variant='card'>سطح الدرج</DrawerSurfaceCard>
      </div>
    );

    expect(screen.getByText('سطح الدرج')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
