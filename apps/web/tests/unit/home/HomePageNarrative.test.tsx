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

vi.mock('@/features/home/BentoFeatureGrid', () => ({
  BentoFeatureGrid: () => (
    <div data-testid='homepage-bento-feature-grid'>bento grid</div>
  ),
}));

describe('HomePageNarrative', () => {
  it('renders the 6-section homepage narrative in order', () => {
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
        name: 'Share every release. Reach every fan. Automatically.',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: 'You made the song. Now make it hit.',
      })
    ).toBeInTheDocument();
  });

  it('renders consolidated 6-section structure without old sections', () => {
    render(<HomePageNarrative />);

    // Old sections should NOT be present
    expect(
      screen.queryByRole('heading', {
        name: 'Your release operating system.',
      })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', {
        name: 'Fans know before you do.',
      })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', {
        name: 'Never start from zero.',
      })
    ).not.toBeInTheDocument();

    // BentoFeatureGrid should be present
    expect(
      screen.getByTestId('homepage-bento-feature-grid')
    ).toBeInTheDocument();
  });

  it('renders the hero cluster and release destinations', () => {
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
      screen.getByTestId('homepage-release-destination-presave')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('homepage-release-destination-live')
    ).toBeInTheDocument();
  });

  it('does not render notification pills', () => {
    render(<HomePageNarrative />);

    // Notification cards were removed in the proof system reframe
    expect(
      screen.queryByTestId('homepage-release-destination-notification')
    ).not.toBeInTheDocument();
  });

  it('renders release destinations with Before/After labels', () => {
    render(<HomePageNarrative />);

    expect(screen.getByText('Before Launch')).toBeInTheDocument();
    expect(screen.getByText('After Launch')).toBeInTheDocument();
  });

  it('renders "Get Started" CTA consistently', () => {
    render(<HomePageNarrative />);

    const ctaButtons = screen.getAllByText('Get Started');
    expect(ctaButtons.length).toBeGreaterThanOrEqual(2);
  });
});
