import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PhoneShowcaseModeData } from './phone-showcase-modes';
import { StickyPhoneTourClient } from './StickyPhoneTourClient';

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

const stickyModes = [
  {
    id: 'profile',
    headline: 'Capture the first visit.',
    description: 'Turn anonymous profile traffic into reachable fans.',
    outcome: 'Grow',
    summary: 'Capture fans first.',
  },
  {
    id: 'tour',
    headline: 'Route fans to the closest show.',
    description: 'Promote the nearest ticket link without another menu.',
    outcome: 'Sell tickets',
    summary: 'Nearest show first.',
  },
] satisfies readonly PhoneShowcaseModeData[];

describe('StickyPhoneTourClient', () => {
  beforeEach(() => {
    vi.stubGlobal('innerHeight', 800);
    vi.stubGlobal('requestIdleCallback', (callback: IdleRequestCallback) => {
      callback({
        didTimeout: false,
        timeRemaining: () => 50,
      } as IdleDeadline);
      return 1;
    });
    vi.stubGlobal('cancelIdleCallback', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders bounded sticky tour copy and route receipts', () => {
    const { container } = render(
      <StickyPhoneTourClient
        artistHandle='sample'
        introBadge='Adaptive fan routing'
        introTitle='Route each fan to one action.'
        modes={stickyModes}
      />
    );

    expect(screen.getByText('Adaptive fan routing')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Route each fan to one action.',
      })
    ).toHaveClass('marketing-h2-linear', 'line-clamp-2');
    expect(
      screen.getByRole('heading', {
        level: 3,
        name: 'Capture the first visit.',
      })
    ).toBeInTheDocument();
    expect(screen.getByTestId('phone-frame')).toBeInTheDocument();

    const routeCopy = Array.from(container.querySelectorAll('p.font-mono'));
    expect(routeCopy.map(route => route.textContent)).toEqual([
      'jov.ie/sample',
      'jov.ie/sample/tour',
    ]);
  });
});
