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

async function loadRoute() {
  return import('@/app/api/admin/hud/symphony-codex-accounts/route');
}

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

  it('returns 401 when the HUD API gate denies inspect', async () => {
    hoisted.requireAdminHudApiAccess.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    );
    const { GET } = await loadRoute();
    expect((await GET()).status).toBe(401);
    expect(hoisted.inspectSymphonyCodexAccounts).not.toHaveBeenCalled();
  });

  it('inspects for admins', async () => {
    hoisted.inspectSymphonyCodexAccounts.mockResolvedValue(SNAPSHOT);
    const { GET } = await loadRoute();
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject(SNAPSHOT);
  });

  it('rejects reconnect without an explicit confirm of an approved account', async () => {
    const { POST } = await loadRoute();
    expect((await POST(post({ account: 'meetjovie' }))).status).toBe(400);
    expect(
      (await POST(post({ account: 'personal', confirm: true }))).status
    ).toBe(400);
    expect(hoisted.reconnectSymphonyCodexAccount).not.toHaveBeenCalled();
  });

  it('reconnects an approved account after confirm', async () => {
    hoisted.reconnectSymphonyCodexAccount.mockResolvedValue(SNAPSHOT);
    const { POST } = await loadRoute();
    const response = await POST(post({ account: 'meetjovie', confirm: true }));
    expect(response.status).toBe(200);
    expect(hoisted.reconnectSymphonyCodexAccount).toHaveBeenCalledWith(
      'meetjovie'
    );
  });
});
