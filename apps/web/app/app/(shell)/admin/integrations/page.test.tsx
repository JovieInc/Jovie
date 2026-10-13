import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requireAccess, renderShared } = vi.hoisted(() => ({
  requireAccess: vi.fn(),
  renderShared: vi.fn(),
}));
vi.mock('@/lib/admin/page-access', () => ({
  requireCurrentAdminPageAccess: requireAccess,
}));
vi.mock('../../settings/layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('../../settings/connectors/SettingsIntegrationsPage', () => ({
  SettingsIntegrationsPage: ({ route }: { route: string }) => {
    renderShared(route);
    return <div>Canonical Settings Integrations</div>;
  },
}));

import OperatorIntegrationsPage from './page';

describe('operator integrations wrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAccess.mockResolvedValue('operator-user');
  });
  it('consumes the identical product surface after operator access is verified', async () => {
    render(await OperatorIntegrationsPage());
    expect(requireAccess).toHaveBeenCalledOnce();
    expect(renderShared).toHaveBeenCalledWith('/app/ov/integrations');
    expect(
      screen.getByText('Canonical Settings Integrations')
    ).toBeInTheDocument();
  });
  it('does not load product data when operator access is rejected', async () => {
    requireAccess.mockRejectedValue(new Error('Access denied'));
    await expect(OperatorIntegrationsPage()).rejects.toThrow('Access denied');
    expect(renderShared).not.toHaveBeenCalled();
  });
});
