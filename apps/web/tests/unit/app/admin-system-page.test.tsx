import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen, within } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAdminSystemMap, mockRequireAccess, mockReadRoom } = vi.hoisted(
  () => ({
    mockAdminSystemMap: vi.fn(({ activeTab }: { activeTab: string }) => (
      <div data-testid='system-map-probe'>{activeTab}</div>
    )),
    mockRequireAccess: vi.fn().mockResolvedValue('user_admin'),
    mockReadRoom: vi.fn(),
  })
);

vi.mock('@/components/features/admin/layout/AdminPage', () => ({
  AdminPage: ({
    children,
    title,
    testId,
    tabs,
    actions,
  }: {
    children: ReactNode;
    title: string;
    testId: string;
    tabs?: { value: string };
    actions?: ReactElement<{ value?: string; param?: string }>;
  }) => (
    <section
      data-testid={testId}
      data-page-title={title}
      data-active-tab={actions?.props.value ?? ''}
      data-filter-param={actions?.props.param ?? ''}
      data-tabs-prop={tabs ? 'yes' : 'no'}
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
vi.mock('@/lib/ovie/fleet-room.server', () => ({
  readOvieFleetRoom: mockReadRoom,
}));
vi.mock('@/lib/seo/noindex-metadata', () => ({
  NOINDEX_ROBOTS: { index: false, follow: false },
}));

const ROOM_AGENT_VIEW = {
  id: 'summer',
  name: 'Summer',
  kind: 'agent',
  role: 'Company governor',
  onRoster: true,
  presence: 'active',
  lastAt: null,
  lastExcerpt: null,
  lastThread: null,
  events24h: 0,
} as const;

const { default: AdminSystemPage } = await import(
  '@/app/app/(shell)/admin/system/page'
);

describe('AdminSystemPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadRoom.mockResolvedValue({
      status: 'ok',
      view: { agents: [ROOM_AGENT_VIEW] },
    });
  });

  it('defaults to the dense agent roster without rendering the system map', async () => {
    render(await AdminSystemPage({ searchParams: Promise.resolve({}) }));

    expect(mockRequireAccess).toHaveBeenCalledOnce();
    expect(mockReadRoom).toHaveBeenCalledOnce();
    expect(screen.getByTestId('admin-system-page')).toHaveAttribute(
      'data-page-title',
      'System map'
    );
    expect(screen.getByTestId('admin-system-page')).toHaveAttribute(
      'data-active-tab',
      'roster'
    );
    expect(screen.getByTestId('admin-system-page')).toHaveAttribute(
      'data-filter-param',
      'tab'
    );
    expect(screen.getByTestId('admin-system-page')).toHaveAttribute(
      'data-tabs-prop',
      'no'
    );
    expect(screen.getByTestId('agent-roster')).toBeVisible();
    const rosterRows = screen.getAllByTestId('agent-room-agent');
    expect(within(rosterRows[0]).getByText('Summer')).toBeInTheDocument();
    expect(mockAdminSystemMap).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('heading', { name: 'Agents' })
    ).not.toBeInTheDocument();
  });

  it('opens the system map from the secondary tabs, keeping deep links working', async () => {
    render(
      await AdminSystemPage({
        searchParams: Promise.resolve({ tab: ['memory', 'tools'] }),
      })
    );

    expect(screen.getByTestId('admin-system-page')).toHaveAttribute(
      'data-active-tab',
      'memory'
    );
    expect(screen.getByTestId('system-map-probe')).toHaveTextContent('memory');
    expect(mockAdminSystemMap).toHaveBeenCalledWith(
      expect.objectContaining({ activeTab: 'memory' }),
      undefined
    );
    expect(screen.queryByTestId('agent-roster')).toBeNull();
  });

  it('falls back unknown tabs to the roster', async () => {
    render(
      await AdminSystemPage({ searchParams: Promise.resolve({ tab: 'bad' }) })
    );

    expect(screen.getByTestId('admin-system-page')).toHaveAttribute(
      'data-active-tab',
      'roster'
    );
    expect(screen.getByTestId('agent-roster')).toBeVisible();
    expect(mockAdminSystemMap).not.toHaveBeenCalled();
  });

  it('keeps direct diagnostic access behind the admin gate', async () => {
    mockRequireAccess.mockRejectedValueOnce(new Error('Admin access required'));

    await expect(
      AdminSystemPage({ searchParams: Promise.resolve({ tab: 'tools' }) })
    ).rejects.toThrow('Admin access required');
    expect(mockAdminSystemMap).not.toHaveBeenCalled();
  });
});

describe('admin system shell boundary', () => {
  it('imports the view select from the system page, not the shared shell', () => {
    const page = readFileSync(
      path.join(
        import.meta.dirname,
        '../../../app/app/(shell)/admin/system/page.tsx'
      ),
      'utf8'
    );
    const shell = readFileSync(
      path.join(
        import.meta.dirname,
        '../../../components/features/admin/layout/AdminPage.tsx'
      ),
      'utf8'
    );
    expect(page).toContain('AdminQueryTabsSelect');
    expect(page).not.toMatch(/\btabs=\{/);
    expect(shell).not.toContain('AdminQueryTabsSelect');
  });
});

describe('admin system navigation contract', () => {
  it('keeps the canonical diagnostic route outside founder navigation', async () => {
    const { ADMIN_NAV_REGISTRY, ADMIN_SETTINGS_TOOL_IDS } = await import(
      '@/constants/admin-navigation'
    );
    const { APP_ROUTES } = await import('@/constants/routes');

    expect(
      ADMIN_NAV_REGISTRY.find(entry => entry.id === 'system_map')
    ).toBeUndefined();
    expect(ADMIN_SETTINGS_TOOL_IDS).not.toContain('system_map');
    expect(APP_ROUTES.ADMIN_SYSTEM).toBe('/app/ov/system');
  });
});
