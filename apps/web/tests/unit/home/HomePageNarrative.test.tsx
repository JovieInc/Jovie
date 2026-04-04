import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HomePageNarrative } from '@/features/home/HomePageNarrative';

vi.mock('@/features/home/ArtistProfileModesShowcase', () => ({
  ArtistProfileModesShowcase: () => (
    <div data-testid='artist-profile-modes-showcase'>modes showcase</div>
  ),
}));

vi.mock('@/features/home/HomeHeroSurfaceCluster', () => ({
  HomeHeroSurfaceCluster: () => (
    <div>
      <div data-testid='homepage-hero-profile-card'>profile</div>
      <div data-testid='homepage-hero-release-card'>release</div>
      <div data-testid='homepage-hero-task-card-1'>task-1</div>
      <div data-testid='homepage-hero-task-card-2'>task-2</div>
      <div data-testid='homepage-hero-task-card-3'>task-3</div>
    </div>
  ),
}));

vi.mock('@/features/home/ReleaseModeMockCard', () => ({
  ReleaseModeMockCard: ({ testId }: { testId?: string }) => (
    <div data-testid={testId ?? 'release-mode-card'}>release card</div>
  ),
}));

vi.mock('@/features/home/ReleaseOperatingSystemShowcase', () => ({
  ReleaseOperatingSystemShowcase: () => (
    <div data-testid='homepage-release-operating-system-surface'>
      operating system
    </div>
  ),
}));

describe('HomePageNarrative', () => {
  it('renders the shorter homepage narrative in order', () => {
    render(<HomePageNarrative />);

    expect(
      screen.getByRole('heading', {
        name: 'Drop more music. Crush every release.',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: 'Profiles that convert.',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: 'Every release gets a clean destination.',
      })
    ).toBeInTheDocument();
    expect(
      screen.getAllByText('Notify every fan. Every time. Automatically.').length
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole('heading', {
        name: 'Your release operating system.',
      })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', {
        name: 'AI that knows the context.',
      })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', {
        name: 'Your catalog and profile presence, in one view.',
      })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', {
        name: 'A promotion plan, generated for every release.',
      })
    ).not.toBeInTheDocument();
  });

  it('renders the hero cluster, release pair, and merged operating-system surface', () => {
    render(<HomePageNarrative />);

    expect(
      screen.getByTestId('homepage-hero-profile-card')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('homepage-hero-release-card')
    ).toBeInTheDocument();
    expect(screen.getByTestId('homepage-hero-task-card-1')).toBeInTheDocument();
    expect(screen.getByTestId('homepage-hero-task-card-2')).toBeInTheDocument();
    expect(screen.getByTestId('homepage-hero-task-card-3')).toBeInTheDocument();
    expect(
      screen.getByTestId('artist-profile-modes-showcase')
    ).toBeInTheDocument();
    expect(
      screen.getAllByTestId('homepage-release-destination-presave').length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByTestId('homepage-release-destination-live').length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByTestId('homepage-release-destination-notification').length
    ).toBeGreaterThan(0);
    expect(
      screen.getByTestId('homepage-release-operating-system-surface')
    ).toBeInTheDocument();
  });
});
