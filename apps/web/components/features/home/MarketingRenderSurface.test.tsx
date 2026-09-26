import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  MARKETING_RENDER_ROUTE_SURFACES,
  MarketingRenderSurface,
} from './MarketingRenderSurface';

vi.mock('./HomeProfileShowcase', () => ({
  HomeProfileShowcase: ({ stateId }: Readonly<{ stateId: string }>) => (
    <div data-testid='home-profile-showcase' data-state-id={stateId} />
  ),
}));
vi.mock('./HomeNotificationCard', () => ({
  HomeNotificationCard: () => <div data-testid='home-notification-card' />,
}));
vi.mock('./HomeRelationshipPanel', () => ({
  HomeRelationshipPanel: () => <div data-testid='home-relationship-panel' />,
}));
vi.mock(
  '@/components/marketing/artist-profile/CompactGlassCaptureDemo',
  () => ({
    CompactGlassCaptureDemo: () => (
      <div data-testid='compact-glass-capture-demo' />
    ),
  })
);

describe('MarketingRenderSurface', () => {
  it('lists compact-glass as a render route surface', () => {
    expect(MARKETING_RENDER_ROUTE_SURFACES.map(s => s.id)).toContain(
      'compact-glass'
    );
  });

  it.each([
    ['profile', 'home-profile-showcase'],
    ['notification', 'home-notification-card'],
    ['tips', 'home-profile-showcase'],
    ['countdown', 'home-profile-showcase'],
    ['fans', 'home-relationship-panel'],
    ['compact-glass', 'compact-glass-capture-demo'],
    ['tour', 'home-profile-showcase'],
  ] as const)('renders the %s surface', (surfaceId, testId) => {
    render(<MarketingRenderSurface surfaceId={surfaceId} />);

    expect(screen.getAllByTestId(testId).length).toBeGreaterThan(0);
  });
});
