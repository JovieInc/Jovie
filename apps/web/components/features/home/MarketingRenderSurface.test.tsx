import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
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
    expect(container.firstElementChild).toHaveClass('marketing-rounded-frame');
  });

  it('renders the compact-glass demo inside the media shell', () => {
    const { container } = renderSurface('compact-glass');

    expect(
      container.querySelector('.compact-glass-module')
    ).toBeInTheDocument();
  });

  it('draws every surface on the always-dark media token with no raw colour', async () => {
    const { container } = renderSurface('notification');
    const shell = container.firstElementChild;

    expect(shell).toHaveClass('bg-ink-on-media');
    expect(shell?.className).not.toMatch(/rgba|gradient|\[/);
    await expectNoA11yViolations(container);
  });

  it('has no accessibility violations on the fans surface', async () => {
    const { container } = renderSurface('fans');
    expect(container.querySelector('.bg-on-media\\/3')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('binds the storybook receipt to the surface', () => {
    expect(storyMeta.component).toBe(MarketingRenderSurface);
    expect(Profile.args?.surfaceId).toBe('profile');
    expect(CompactGlass.args?.surfaceId).toBe('compact-glass');
    expect(AllRouteSurfaces).toBeDefined();
  });
});
