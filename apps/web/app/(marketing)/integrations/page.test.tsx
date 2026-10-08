import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getConnectorDefinitions } from '@/lib/connectors/registry';

const { configuration } = vi.hoisted(() => ({ configuration: vi.fn() }));
vi.mock('@/lib/connectors/availability.server', () => ({
  getConnectorAvailability: configuration,
}));

import IntegrationsDirectoryPage from './page';

describe('public integrations projection', () => {
  beforeEach(() => {
    configuration.mockReturnValue(
      Object.fromEntries(
        getConnectorDefinitions().map(definition => [
          definition.id,
          { available: definition.id === 'youtube' },
        ])
      )
    );
  });
  it('renders implemented available operations rather than provider promises', () => {
    render(<IntegrationsDirectoryPage />);
    expect(
      screen.getByRole('heading', { name: 'YouTube' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Spotify' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Post approved replies.*Requires approval/)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Instagram|Search Console|all comments/)
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Manage integrations' })
    ).toHaveAttribute('href', '/app/settings/connectors');
  });
  it('explains unavailable connection setup without offering placeholder connections', () => {
    configuration.mockReturnValue(
      Object.fromEntries(
        getConnectorDefinitions().map(definition => [
          definition.id,
          { available: false },
        ])
      )
    );
    render(<IntegrationsDirectoryPage />);
    expect(
      screen.getByText(/Account connections are currently unavailable/)
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
  });
});
