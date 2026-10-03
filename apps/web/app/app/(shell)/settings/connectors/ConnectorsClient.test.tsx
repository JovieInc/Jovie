import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { CONNECTOR_REGISTRY } from '@/lib/connectors/registry';
import { ConnectorsClient } from './ConnectorsClient';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock('@/components/feedback', () => ({
  toast: { success: mocks.success, error: mocks.error },
}));
vi.mock('@/components/organisms/integrations/IntegrationDirectory', () => ({
  IntegrationDirectory: () => null,
}));
vi.mock('@/components/organisms/integrations/IntegrationRequestForm', () => ({
  IntegrationRequestForm: () => null,
}));
vi.mock('@/components/features/dashboard/organisms/SettingsSection', () => ({
  SettingsSection: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/components/molecules/settings/SettingsPanel', () => ({
  SettingsPanel: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/components/features/connectors/ConnectorCard', () => ({
  ConnectorCard: ({
    provider,
    onConnect,
    onDisconnect,
  }: {
    provider: string;
    onConnect: () => void;
    onDisconnect: () => void;
  }) => (
    <div>
      <button onClick={onConnect} type='button'>
        Connect {provider}
      </button>
      <button onClick={onDisconnect} type='button'>
        Disconnect {provider}
      </button>
    </div>
  ),
}));

const props = {
  gmail: { status: 'not_connected' as const },
  calendar: { status: 'not_connected' as const },
  suggestedActions: [],
  isDev: false,
};
describe('registry-driven account settings', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });
  it('carries profile scope through YouTube OAuth but not shared Google OAuth', () => {
    render(<ConnectorsClient {...props} creatorProfileId='profile-id' />);
    fireEvent.click(screen.getByText('Connect youtube'));
    const youtube = new URL(mocks.push.mock.calls[0][0], 'http://localhost');
    expect(youtube.pathname).toBe(CONNECTOR_REGISTRY.youtube.authorizePath);
    expect(youtube.searchParams.get('creatorProfileId')).toBe('profile-id');
    expect(youtube.searchParams.get('returnTo')).toBe(
      APP_ROUTES.SETTINGS_CONNECTORS
    );
    fireEvent.click(screen.getByText('Connect google_calendar'));
    const calendar = new URL(mocks.push.mock.calls[1][0], 'http://localhost');
    expect(calendar.pathname).toBe(
      CONNECTOR_REGISTRY.google_calendar.authorizePath
    );
    expect(calendar.searchParams.has('creatorProfileId')).toBe(false);
  });
  it('sends users without a profile to the existing Library setup flow', () => {
    render(<ConnectorsClient {...props} />);
    fireEvent.click(screen.getByText('Connect youtube'));
    expect(mocks.push).toHaveBeenCalledWith(APP_ROUTES.LIBRARY);
  });
  it('disconnects only the selected profile for a profile-scoped connector', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetch);
    render(<ConnectorsClient {...props} creatorProfileId='profile-id' />);
    fireEvent.click(screen.getByText('Disconnect youtube'));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      CONNECTOR_REGISTRY.youtube.disconnectPath,
      expect.objectContaining({
        body: JSON.stringify({ creatorProfileId: 'profile-id' }),
      })
    );
  });
  it('keeps failed disconnects recoverable without claiming success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    render(<ConnectorsClient {...props} />);
    fireEvent.click(screen.getByText('Disconnect gmail'));
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });
});
