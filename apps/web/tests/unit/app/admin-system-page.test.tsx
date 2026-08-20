import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAdminSystemMap, mockRequireAccess } = vi.hoisted(() => ({
  mockAdminSystemMap: vi.fn(({ activeTab }: { activeTab: string }) => (
    <div data-testid='system-map-probe'>{activeTab}</div>
  )),
  mockRequireAccess: vi.fn().mockResolvedValue('user_admin'),
}));

vi.mock('@/components/features/admin/layout/AdminPage', () => ({
  AdminPage: ({
    children,
    title,
    testId,
    tabs,
  }: {
    children: ReactNode;
    title: string;
    testId: string;
    tabs: { value: string };
  }) => (
    <section
      data-testid={testId}
      data-page-title={title}
      data-active-tab={tabs.value}
    >
      {children}
    </section>
  ),
}));

vi.mock('@/components/features/admin/system-map/AdminSystemMap', () => ({
  AdminSystemMap: mockAdminSystemMap,
}));
vi.mock('@/lib/admin/page-access', () => ({
  requireCurrentAdminPageAccess: mockRequireAccess,
}));
vi.mock('@/lib/seo/noindex-metadata', () => ({
  NOINDEX_ROBOTS: { index: false, follow: false },
}));

describe('AdminSystemPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('defaults unknown tabs to skills without rendering a duplicate title', async () => {
    const { default: AdminSystemPage } = await import(
      '@/app/app/(shell)/admin/system/page'
    );
    render(
      await AdminSystemPage({ searchParams: Promise.resolve({ tab: 'bad' }) })
    );

    expect(mockRequireAccess).toHaveBeenCalledOnce();
    expect(screen.getByTestId('admin-system-page')).toHaveAttribute(
      'data-page-title',
      'System Map'
    );
    expect(screen.getByTestId('admin-system-page')).toHaveAttribute(
      'data-active-tab',
      'skills'
    );
    expect(mockAdminSystemMap).toHaveBeenCalledWith(
      expect.objectContaining({ activeTab: 'skills' }),
      undefined
    );
    expect(
      screen.queryByRole('heading', { name: 'System Map' })
    ).not.toBeInTheDocument();
  });

  it('preserves an explicit tab from array search params', async () => {
    const { default: AdminSystemPage } = await import(
      '@/app/app/(shell)/admin/system/page'
    );
    render(
      await AdminSystemPage({
        searchParams: Promise.resolve({ tab: ['memory', 'tools'] }),
      })
    );

    expect(screen.getByTestId('system-map-probe')).toHaveTextContent('memory');
    expect(mockAdminSystemMap).toHaveBeenCalledWith(
      expect.objectContaining({ activeTab: 'memory' }),
      undefined
    );
  });
});

describe('admin system navigation contract', () => {
  it('keeps the canonical system route and registry entry', async () => {
    const { ADMIN_NAV_REGISTRY, ADMIN_SETTINGS_TOOL_IDS } = await import(
      '@/constants/admin-navigation'
    );
    const { APP_ROUTES } = await import('@/constants/routes');

    expect(
      ADMIN_NAV_REGISTRY.find(entry => entry.id === 'system_map')?.label
    ).toBe('System Map');
    expect(ADMIN_SETTINGS_TOOL_IDS).toContain('system_map');
    expect(APP_ROUTES.ADMIN_SYSTEM).toBe('/app/ov/system');
  });
});
