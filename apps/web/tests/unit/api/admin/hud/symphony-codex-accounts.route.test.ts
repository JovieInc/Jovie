import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const hoisted = vi.hoisted(() => ({
  requireAdminHudApiAccess: vi.fn(),
  inspectSymphonyCodexAccounts: vi.fn(),
  reconnectSymphonyCodexAccount: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock('@/lib/hud/require-admin-hud-api', () => ({
  requireAdminHudApiAccess: hoisted.requireAdminHudApiAccess,
}));
vi.mock('@/lib/hud/symphony-codex-accounts.server', () => ({
  inspectSymphonyCodexAccounts: hoisted.inspectSymphonyCodexAccounts,
  reconnectSymphonyCodexAccount: hoisted.reconnectSymphonyCodexAccount,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: hoisted.captureError }));
vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

const SNAPSHOT = {
  schema: 'symphony-codex-account-control/v1',
  accounts: [{ label: 'meetjovie', state: 'usage-exhausted' }],
};

function post(body: unknown) {
  return new Request('http://localhost/api/admin/hud/symphony-codex-accounts', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('/api/admin/hud/symphony-codex-accounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.requireAdminHudApiAccess.mockResolvedValue(null);
  });

  it('gates inspect and only reconnects a confirmed approved account', async () => {
    const route = await import(
      '@/app/api/admin/hud/symphony-codex-accounts/route'
    );
    hoisted.requireAdminHudApiAccess.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    );
    expect((await route.GET()).status).toBe(401);
    expect(hoisted.inspectSymphonyCodexAccounts).not.toHaveBeenCalled();
    hoisted.requireAdminHudApiAccess.mockResolvedValue(null);
    hoisted.inspectSymphonyCodexAccounts.mockResolvedValue(SNAPSHOT);
    const inspect = await route.GET();
    expect(inspect.status).toBe(200);
    await expect(inspect.json()).resolves.toMatchObject(SNAPSHOT);
    expect((await route.POST(post({ account: 'meetjovie' }))).status).toBe(400);
    expect(
      (await route.POST(post({ account: 'personal', confirm: true }))).status
    ).toBe(400);
    expect(hoisted.reconnectSymphonyCodexAccount).not.toHaveBeenCalled();
    hoisted.reconnectSymphonyCodexAccount.mockResolvedValue(SNAPSHOT);
    const reconnect = await route.POST(
      post({ account: 'meetjovie', confirm: true })
    );
    expect(reconnect.status).toBe(200);
    expect(hoisted.reconnectSymphonyCodexAccount).toHaveBeenCalledWith(
      'meetjovie'
    );
  });
});
