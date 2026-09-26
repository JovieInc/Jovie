import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  isMarketingRenderRouteSurfaceId,
  MARKETING_RENDER_ROUTE_SURFACES,
  MarketingRenderSurface,
} from './MarketingRenderSurface';
import storyMeta, {
  AllRouteSurfaces,
  CompactGlass,
  Profile,
} from './MarketingRenderSurface.stories';

function renderSurface(
  surfaceId: Parameters<typeof MarketingRenderSurface>[0]['surfaceId']
) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MarketingRenderSurface surfaceId={surfaceId} />
    </QueryClientProvider>
  );
}

describe('MarketingRenderSurface', () => {
  it('exposes a routable surface id for every registry entry', () => {
    for (const surface of MARKETING_RENDER_ROUTE_SURFACES) {
      expect(isMarketingRenderRouteSurfaceId(surface.id)).toBe(true);
    }
    expect(isMarketingRenderRouteSurfaceId('compact-glass')).toBe(true);
    expect(isMarketingRenderRouteSurfaceId('tour')).toBe(false);
  });

  it.each([
    ...MARKETING_RENDER_ROUTE_SURFACES.map(surface => surface.id),
    'tour',
  ] as const)('renders the %s surface without throwing', surfaceId => {
    const { container } = renderSurface(surfaceId);

    expect(container.firstElementChild).not.toBeNull();
    expect(container.firstElementChild).not.toBeEmptyDOMElement();
  });

  it('renders the compact-glass demo inside the emphasized shell', () => {
    const { container } = renderSurface('compact-glass');

    expect(
      container.querySelector('.compact-glass-module')
    ).toBeInTheDocument();
  });

  it('binds the storybook receipt to the surface', () => {
    expect(storyMeta.component).toBe(MarketingRenderSurface);
    expect(Profile.args?.surfaceId).toBe('profile');
    expect(CompactGlass.args?.surfaceId).toBe('compact-glass');
    expect(AllRouteSurfaces).toBeDefined();
  });
});
