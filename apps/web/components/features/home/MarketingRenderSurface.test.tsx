import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  isMarketingRenderRouteSurfaceId,
  MARKETING_RENDER_ROUTE_SURFACES,
  MarketingRenderSurface,
} from './MarketingRenderSurface';

vi.mock('./HomeProfileShowcase', () => ({
  HomeProfileShowcase: ({
    stateId,
    presentation,
  }: Readonly<{ stateId: string; presentation?: string }>) => (
    <div
      data-testid='profile-showcase'
      data-state={stateId}
      data-presentation={presentation}
    />
  ),
}));

vi.mock('./HomeNotificationCard', () => ({
  HomeNotificationCard: () => <div data-testid='notification-card' />,
}));

vi.mock('./HomeRelationshipPanel', () => ({
  HomeRelationshipPanel: () => <div data-testid='relationship-panel' />,
}));

vi.mock(
  '@/components/marketing/artist-profile/CompactGlassCaptureDemo',
  () => ({
    CompactGlassCaptureDemo: () => <div data-testid='compact-glass-demo' />,
  })
);

describe('MarketingRenderSurface', () => {
  it('registers every route surface including compact-glass', () => {
    const ids = MARKETING_RENDER_ROUTE_SURFACES.map(surface => surface.id);
    expect(ids).toEqual([
      'profile',
      'notification',
      'tips',
      'countdown',
      'fans',
      'compact-glass',
    ]);
    for (const surface of MARKETING_RENDER_ROUTE_SURFACES) {
      expect(surface.href).toBe(`/renders/surfaces/${surface.id}`);
      expect(isMarketingRenderRouteSurfaceId(surface.id)).toBe(true);
    }
    expect(isMarketingRenderRouteSurfaceId('tour')).toBe(false);
  });

  it('renders the compact-glass capture demo for the compact-glass surface', () => {
    render(<MarketingRenderSurface surfaceId='compact-glass' />);
    expect(screen.getByTestId('compact-glass-demo')).toBeInTheDocument();
  });

  it('renders the notification card for the notification surface', () => {
    render(<MarketingRenderSurface surfaceId='notification' />);
    expect(screen.getByTestId('notification-card')).toBeInTheDocument();
  });

  it('renders the relationship panel for the fans surface', () => {
    render(<MarketingRenderSurface surfaceId='fans' />);
    expect(screen.getByTestId('relationship-panel')).toBeInTheDocument();
  });

  it('maps profile and tour surfaces to profile showcase states', () => {
    const { unmount } = render(<MarketingRenderSurface surfaceId='profile' />);
    expect(screen.getByTestId('profile-showcase')).toHaveAttribute(
      'data-state',
      'streams-latest'
    );
    unmount();

    render(<MarketingRenderSurface surfaceId='tour' />);
    expect(screen.getByTestId('profile-showcase')).toHaveAttribute(
      'data-state',
      'tour'
    );
  });
});
