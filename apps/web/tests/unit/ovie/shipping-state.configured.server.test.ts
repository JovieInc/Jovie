import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  createReaders: vi.fn(),
  defaultLiveIo: vi.fn(),
  publish: vi.fn(),
}));

vi.mock('server-only', () => ({}));

vi.mock('@/lib/env-server', () => ({
  env: {
    HUD_GITHUB_TOKEN: 'test-token',
    HUD_GITHUB_OWNER: 'JovieInc',
    HUD_GITHUB_REPO: 'Jovie',
  },
}));

vi.mock('@/lib/ovie/shipping-state/live', () => ({
  createLiveShippingStateReaders: hoisted.createReaders,
  defaultLiveIo: hoisted.defaultLiveIo,
}));

vi.mock('@/lib/ovie/shipping-state/publisher', () => ({
  publishShippingState: hoisted.publish,
}));

describe('configured shipping-state publisher', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    hoisted.defaultLiveIo.mockReturnValue({ fetch: vi.fn() });
    hoisted.createReaders.mockReturnValue({ configured: true });
    hoisted.publish.mockResolvedValue({ schema: 'ovie.shipping-state.v1' });
  });

  it('creates one configured reader set and delegates bounded coalescing to the publisher', async () => {
    const clock = {
      nowIso: vi.fn(() => '2026-08-22T00:00:00.000Z'),
      nowMs: vi.fn(() => Date.parse('2026-08-22T00:00:00.000Z')),
    };
    const { publishConfiguredShippingState } = await import(
      '@/lib/ovie/shipping-state/configured.server'
    );

    await publishConfiguredShippingState({ clock });
    await publishConfiguredShippingState();

    expect(hoisted.defaultLiveIo).toHaveBeenCalledTimes(1);
    expect(hoisted.defaultLiveIo).toHaveBeenCalledWith({
      githubToken: 'test-token',
      githubOwner: 'JovieInc',
      githubRepo: 'Jovie',
    });
    expect(hoisted.createReaders).toHaveBeenCalledTimes(1);
    expect(hoisted.publish).toHaveBeenNthCalledWith(1, {
      readers: { configured: true },
      clock,
      maxAgeMs: 6_000,
    });
    expect(hoisted.publish).toHaveBeenNthCalledWith(2, {
      readers: { configured: true },
      maxAgeMs: 6_000,
    });
  });
});
