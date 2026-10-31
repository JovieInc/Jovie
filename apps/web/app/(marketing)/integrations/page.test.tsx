import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getConnectorDefinitions } from '@/lib/connectors/registry';

const { configuration } = vi.hoisted(() => ({ configuration: vi.fn() }));
const providerIds = getConnectorDefinitions().map(({ id }) => id);
const availability = (youtube: boolean) =>
  Object.fromEntries(
    providerIds.map(id => [id, { available: youtube && id === 'youtube' }])
  );
vi.mock('@/lib/connectors/availability.server', () => ({
  getConnectorAvailability: configuration,
}));

import IntegrationsDirectoryPage from './page';

const getHeading = (name: string) => screen.getByRole('heading', { name });
const present = (pattern: RegExp) =>
  expect(screen.getByText(pattern)).toBeInTheDocument();
const absent = (pattern: RegExp) =>
  expect(screen.queryByText(pattern)).not.toBeInTheDocument();
describe('public integrations projection', () => {
  beforeEach(() => configuration.mockReturnValue(availability(true)));
  it('renders implemented available operations rather than provider promises', () => {
    render(<IntegrationsDirectoryPage />);
    expect(getHeading('YouTube')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Spotify' })
    ).not.toBeInTheDocument();
    absent(/comment replies|Post approved replies/i);
    present(/Apply approved thumbnails.*Requires approval/);
    absent(/Instagram|Search Console|all comments/);
    expect(
      screen.getByRole('link', { name: 'Manage integrations' })
    ).toHaveAttribute('href', '/app/settings/connectors');
  });
  it('offers an actionable path when no connections are advertised', () => {
    configuration.mockReturnValue(availability(false));
    render(<IntegrationsDirectoryPage />);
    present(/No account connections are advertised on this deployment/);
    expect(
      screen.getByRole('link', {
        name: 'Review your account connections in Settings',
      })
    ).toHaveAttribute('href', '/app/settings/connectors');
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
  });
});
