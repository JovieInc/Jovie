import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRequireAccess, mockReadRoom, mockWorkspace } = vi.hoisted(() => ({
  mockRequireAccess: vi.fn().mockResolvedValue('user_admin'),
  mockReadRoom: vi.fn(),
  mockWorkspace: vi.fn(
    ({ rows }: { rows: { id: string; defaultDisplayName: string }[] }) => (
      <div data-testid='fleet-agents-workspace' data-row-count={rows.length}>
        {rows.map(row => (
          <div key={row.id} data-testid={`workspace-row-${row.id}`}>
            {row.defaultDisplayName}
          </div>
        ))}
      </div>
    )
  ),
}));

vi.mock('@/components/features/admin/layout/AdminPage', () => ({
  AdminPage: ({
    children,
    title,
    testId,
    views,
    layout,
  }: {
    children: ReactNode;
    title: string;
    testId: string;
    views?: string;
    layout?: string;
  }) => (
    <section
      data-testid={testId}
      data-page-title={title}
      data-views={views ?? ''}
      data-layout={layout ?? ''}
    >
      {children}
    </section>
  ),
}));

vi.mock(
  '@/components/features/admin/fleet-agents/OvieFleetAgentsWorkspace',
  () => ({
    OvieFleetAgentsWorkspace: mockWorkspace,
  })
);

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

const { default: AdminAgentsPage } = await import(
  '@/app/app/(shell)/admin/agents/page'
);

describe('AdminAgentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadRoom.mockResolvedValue({
      status: 'ok',
      view: { agents: [ROOM_AGENT_VIEW] },
    });
  });

  it('renders the fleet agents workspace behind operations route views', async () => {
    render(await AdminAgentsPage());

    expect(mockRequireAccess).toHaveBeenCalledOnce();
    expect(mockReadRoom).toHaveBeenCalledOnce();
    const page = screen.getByTestId('admin-agents-page');
    expect(page).toHaveAttribute('data-page-title', 'Agents');
    expect(page).toHaveAttribute('data-views', 'operations');
    expect(page).toHaveAttribute('data-layout', 'workspace');
    expect(screen.getByTestId('fleet-agents-workspace')).toHaveAttribute(
      'data-row-count',
      '8'
    );
  });
});

describe('admin agents navigation contract', () => {
  it('registers Agents in founder navigation and fleet view tabs', async () => {
    const { ADMIN_NAV_REGISTRY, ADMIN_WORKSPACE_TABS } = await import(
      '@/constants/admin-navigation'
    );
    const { APP_ROUTES } = await import('@/constants/routes');

    const agentsNav = ADMIN_NAV_REGISTRY.find(entry => entry.id === 'agents');
    expect(agentsNav?.href).toBe(APP_ROUTES.ADMIN_AGENTS);
    expect(agentsNav?.label).toBe('Agents');
    expect(
      ADMIN_WORKSPACE_TABS.operations.find(tab => tab.label === 'Agents')?.href
    ).toBe(APP_ROUTES.ADMIN_AGENTS);
  });
});
