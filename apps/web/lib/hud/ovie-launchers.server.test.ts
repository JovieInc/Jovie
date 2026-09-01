import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const hoisted = vi.hoisted(() => ({
  serverFetch: vi.fn(),
  fetchTimActionIssues: vi.fn(),
  spawn: vi.fn(),
  env: {
    GBRAIN_API_URL: undefined as string | undefined,
    HUD_GITHUB_OWNER: undefined as string | undefined,
    HUD_GITHUB_REPO: undefined as string | undefined,
  },
  publicEnv: { NEXT_PUBLIC_APP_URL: 'https://jov.ie' },
}));

vi.mock('@/lib/env-server', () => ({ env: hoisted.env }));
vi.mock('@/lib/env-public', () => ({ publicEnv: hoisted.publicEnv }));
vi.mock('@/lib/http/server-fetch', () => ({
  serverFetch: hoisted.serverFetch,
}));
vi.mock('@/lib/hud/linear-actions', () => ({
  fetchTimActionIssues: hoisted.fetchTimActionIssues,
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));
vi.mock('node:child_process', () => ({
  spawn: hoisted.spawn,
  default: { spawn: hoisted.spawn },
}));

import {
  loadOvieLauncherInventory,
  preflightSshDestination,
  preflightWebDestination,
  resolveOvieLauncherDestinations,
} from './ovie-launchers.server';

class FakeSsh extends EventEmitter {
  kill = vi.fn();
}

describe('ovie-launchers.server', () => {
  afterEach(() => {
    vi.clearAllMocks();
    hoisted.env.GBRAIN_API_URL = undefined;
    hoisted.env.HUD_GITHUB_OWNER = undefined;
    hoisted.env.HUD_GITHUB_REPO = undefined;
  });

  it('resolves configured origins without leaking secrets and preflights failures', async () => {
    hoisted.env.GBRAIN_API_URL = 'http://100.64.8.9:7801/mcp?q=1';
    const destinations = resolveOvieLauncherDestinations();
    expect(destinations.gbrain?.href).toBe('http://100.64.8.9:7801');
    expect(JSON.stringify(destinations)).not.toMatch(/\bq=1\b/);
    expect(destinations.hermes?.href).toBe('http://127.0.0.1:7800');
    expect(destinations.symphony?.sshHost).toBe('gem');
    expect(destinations.symphony?.href).toBeUndefined();
    hoisted.serverFetch.mockRejectedValue(new Error('connect ECONNREFUSED'));
    await expect(
      preflightWebDestination('http://127.0.0.1:7801/health')
    ).resolves.toEqual({
      status: 'unavailable',
      detail: 'Destination unreachable',
    });
  });

  it('treats SSH preflight success as ready and rejects unsafe hosts', async () => {
    const child = new FakeSsh();
    const pending = preflightSshDestination('gem', vi.fn(() => child) as never);
    child.emit('exit', 0);
    await expect(pending).resolves.toEqual({
      status: 'ready',
      detail: 'SSH reachable',
    });
    await expect(
      preflightSshDestination('-oProxyCommand=evil')
    ).resolves.toEqual({
      status: 'not_configured',
      detail: 'SSH host is not a safe alias',
    });
  });

  it('builds an inventory that keeps agent CLI out of the primary rail', async () => {
    hoisted.serverFetch.mockResolvedValue({
      status: 200,
      body: { cancel: () => Promise.resolve() },
    });
    hoisted.fetchTimActionIssues.mockResolvedValue({
      issues: [{ id: '1' }],
      observation: 'ok',
    });
    const inventory = await loadOvieLauncherInventory();
    expect(inventory.primary.map(item => item.id)).toEqual(
      expect.arrayContaining(['gbrain', 'hermes', 'symphony'])
    );
    expect(
      inventory.primary.find(item => item.id === 'symphony')
    ).toMatchObject({
      label: 'Open Gem Terminal',
      status: 'ready',
      sshHost: 'gem',
    });
    expect(hoisted.spawn).not.toHaveBeenCalled();
    expect(inventory.primary.some(item => item.agentCliOnly)).toBe(false);
    expect(JSON.stringify(inventory)).not.toMatch(
      /api[_-]?key|token=|secret|bearer /i
    );
  });
});
