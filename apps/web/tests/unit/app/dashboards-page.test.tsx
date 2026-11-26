import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({ load: vi.fn(), list: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/app/app/(shell)/app-shell-route-context', () => ({
  loadAppShellRouteContext: hoisted.load,
}));
vi.mock('@/lib/views/service.server', () => ({
  listDashboardsForOwner: hoisted.list,
}));
vi.mock('@/components/features/views/DashboardsTable', () => ({
  DashboardsTable: ({ rows }: { rows: { title: string }[] }) => (
    <ul>
      {rows.map(r => (
        <li key={r.title}>{r.title}</li>
      ))}
    </ul>
  ),
}));

import DashboardsPage from '@/app/app/(shell)/dashboards/page';

beforeEach(() => vi.clearAllMocks());

describe('DashboardsPage', () => {
  it('lists the signed-in user dashboards', async () => {
    hoisted.load.mockResolvedValue({ ok: true, userId: 'user-1' });
    hoisted.list.mockResolvedValue([
      {
        id: '1',
        title: 'Weekly',
        token: 'a'.repeat(32),
        version: 1,
        source: 'agent',
        updatedAt: new Date('2026-11-22T00:00:00Z'),
      },
    ]);
    render(await DashboardsPage());
    expect(hoisted.list).toHaveBeenCalledWith('user-1');
    expect(screen.getByRole('heading', { name: 'Dashboards' })).toBeVisible();
    expect(screen.getByText('Weekly')).toBeInTheDocument();
  });

  it('returns the shell error when the route context fails', async () => {
    hoisted.load.mockResolvedValue({ ok: false, error: <p>nope</p> });
    render(await DashboardsPage());
    expect(screen.getByText('nope')).toBeInTheDocument();
    expect(hoisted.list).not.toHaveBeenCalled();
  });
});
