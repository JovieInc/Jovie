import { isValidElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const [context, load] = vi.hoisted(() => [vi.fn(), vi.fn()] as const);
vi.mock('../../app-shell-route-context', () => ({
  loadAppShellRouteContext: context,
}));
vi.mock('./connectors-data', () => ({ loadSettingsConnectorsData: load }));
vi.mock('@/lib/utils/platform-detection/environment', () => ({
  isDevelopment: () => false,
}));

import { SettingsIntegrationsPage } from './SettingsIntegrationsPage';

describe('shared settings integrations loader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    context.mockResolvedValue({
      ok: true,
      userId: 'session-user',
      profileId: 'selected-identity',
    });
    load.mockResolvedValue({ connectors: {} });
  });
  it.each(['/app/settings/connectors', '/app/ov/integrations'])(
    'retains the authenticated account and selected identity for %s',
    async route => {
      const element = await SettingsIntegrationsPage({ route });
      expect(load).toHaveBeenCalledWith('session-user', 'selected-identity');
      expect(context).toHaveBeenCalledWith(expect.objectContaining({ route }));
      expect(element).toHaveProperty('key', 'session-user:selected-identity');
      expect(isValidElement(element) && element.props).toMatchObject({
        creatorProfileId: 'selected-identity',
        returnTo: route,
        isDev: false,
      });
    }
  );
  it('does not read connection data after shell authorization fails', async () => {
    const error = <div>Shell unavailable</div>;
    context.mockResolvedValue({ ok: false, error });
    expect(await SettingsIntegrationsPage({})).toBe(error);
    expect(load).not.toHaveBeenCalled();
  });
  it('keeps missing account data as an error rather than an empty connections list', async () => {
    load.mockResolvedValue(null);
    const element = await SettingsIntegrationsPage({});
    expect(isValidElement(element) && element.props).toHaveProperty(
      'message',
      'Unable to load your account connections. Please refresh the page.'
    );
  });
});
