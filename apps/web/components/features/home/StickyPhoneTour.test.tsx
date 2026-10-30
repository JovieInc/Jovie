import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PhoneShowcaseModeData } from './phone-showcase-modes';
import { StickyPhoneTour } from './StickyPhoneTour';

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children }: { readonly children?: ReactNode }) => (
      <div>{children}</div>
    ),
  },
}));

vi.mock('@/components/atoms/ArtistName', () => ({
  ArtistName: ({ name }: { readonly name: string }) => <p>{name}</p>,
}));

vi.mock('@/components/molecules/Avatar', () => ({
  Avatar: ({ alt, src }: { readonly alt: string; readonly src: string }) => (
    <img alt={alt} src={src} />
  ),
}));

vi.mock('@/lib/hooks/useReducedMotion', () => ({
  useReducedMotion: () => true,
}));

vi.mock('./PhoneFrame', () => ({
  PhoneFrame: ({ children }: { readonly children: ReactNode }) => (
    <div data-testid='phone-frame'>{children}</div>
  ),
}));

const fallbackModes = [
  {
    id: 'profile',
    headline: 'Capture fans first.',
    description: 'Keep the profile action focused before the fan leaves.',
    outcome: 'Grow',
    summary: 'Capture fans.',
  },
  {
    id: 'tour',
    headline: 'Sell the closest ticket.',
    description: 'Route local fans straight to the right tour date.',
    outcome: 'Sell tickets',
    summary: 'Closest ticket.',
  },
] satisfies readonly PhoneShowcaseModeData[];

describe('StickyPhoneTour', () => {
  beforeEach(() => {
    vi.stubGlobal('requestIdleCallback', () => 1);
    vi.stubGlobal('cancelIdleCallback', () => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders the fail-closed sticky fallback with bounded copy and routes', () => {
    const { container, unmount } = render(
      <StickyPhoneTour
        artistHandle='demo'
        introBadge='Fallback profile routing'
        introTitle='One fallback action per fan.'
        modes={fallbackModes}
      />
    );

    expect(screen.getByText('Fallback profile routing')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'One fallback action per fan.',
      })
    ).toHaveClass('marketing-h2-linear', 'line-clamp-2');
    expect(
      screen.getByRole('heading', {
        level: 3,
        name: 'Capture fans first.',
      })
    ).toBeInTheDocument();
    expect(screen.getByTestId('phone-frame')).toBeInTheDocument();

    const routeCopy = Array.from(container.querySelectorAll('p.font-mono'));
    expect(routeCopy.map(route => route.textContent)).toEqual([
      'jov.ie/demo',
      'jov.ie/demo/tour',
    ]);

    // Unmount while the idle-callback stubs are still installed — the
    // component cleanup calls globalThis.cancelIdleCallback.
    unmount();
  });
});
