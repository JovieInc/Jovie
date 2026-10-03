import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Test directory interaction independently of the shared icon renderer.
vi.mock('@/components/atoms/SocialIcon', () => ({ SocialIcon: () => null }));
// Keep DOM interaction fixtures small; catalog parity and Playwright cover the full directory.
vi.mock('@/lib/integrations/catalog', async importOriginal => {
  const catalog =
    await importOriginal<typeof import('@/lib/integrations/catalog')>();
  const fixtureIds = new Set(['spotify', 'apple_music', 'youtube', 'gmail']);
  return {
    ...catalog,
    filterIntegrations: (
      ...args: Parameters<typeof catalog.filterIntegrations>
    ) =>
      catalog
        .filterIntegrations(...args)
        .filter(entry => fixtureIds.has(entry.id)),
  };
});

import { buildSpotifyCatalogConnectionRoute } from '@/constants/routes';
import { IntegrationDirectory } from './IntegrationDirectory';

describe('IntegrationDirectory', () => {
  it('searches aliases, combines categories, and recovers from empty results', () => {
    render(<IntegrationDirectory />);
    const search = screen.getByLabelText('Search integrations');
    search.focus();
    fireEvent.change(search, { target: { value: 'iTunes' } });
    expect(
      screen.getByRole('heading', { hidden: true, name: 'Apple Music' })
    ).toBeDefined();
    expect(
      screen.queryByRole('heading', { hidden: true, name: 'Spotify' })
    ).toBeNull();
    expect(document.activeElement).toBe(search);
    fireEvent.click(
      screen.getByRole('button', { hidden: true, name: 'Productivity' })
    );
    expect(
      screen.getByText('No integrations match your search.')
    ).toBeDefined();
    fireEvent.click(
      screen.getByRole('button', { hidden: true, name: 'Clear Filters' })
    );
    expect(screen.getByText('Spotify', { selector: 'h2' })).toBeDefined();
    expect(document.activeElement).toBe(search);
  });
  it('offers the working Spotify catalog entry point and a single YouTube card', () => {
    render(<IntegrationDirectory />);
    expect(
      screen
        .getByLabelText('Connect Artist Catalog: Spotify')
        .getAttribute('href')
    ).toBe(buildSpotifyCatalogConnectionRoute());
    expect(screen.getAllByText('YouTube', { selector: 'h2' })).toHaveLength(1);
  });
});
