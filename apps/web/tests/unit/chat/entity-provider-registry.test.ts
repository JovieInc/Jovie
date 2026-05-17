import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EntityProvider } from '@/lib/commands/entities';

function makeProvider(registryKey: string): EntityProvider {
  return {
    kind: 'release',
    registryKey,
    label: 'Releases',
    useSearch: () => ({ items: [], isLoading: false }),
    renderChip: () => null,
  };
}

describe('entity provider registry', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not warn when the same semantic provider registers again', async () => {
    vi.resetModules();
    const { registerEntityProvider } = await import('@/lib/commands/entities');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    registerEntityProvider(makeProvider('release:profile-1'));
    registerEntityProvider(makeProvider('release:profile-1'));

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('still warns when a different scoped provider replaces an existing kind', async () => {
    vi.resetModules();
    const { registerEntityProvider } = await import('@/lib/commands/entities');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    registerEntityProvider(makeProvider('release:profile-1'));
    registerEntityProvider(makeProvider('release:profile-2'));

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        '[commands] Replacing existing EntityProvider for kind="release".'
      )
    );
  });

  it('unregisters only the active provider object', async () => {
    vi.resetModules();
    const {
      getEntityProvider,
      registerEntityProvider,
      unregisterEntityProvider,
    } = await import('@/lib/commands/entities');
    const firstProvider = makeProvider('release:profile-1');
    const replacementProvider = makeProvider('release:profile-1');

    registerEntityProvider(firstProvider);
    registerEntityProvider(replacementProvider);
    unregisterEntityProvider(firstProvider);

    expect(getEntityProvider('release')).toBe(replacementProvider);

    unregisterEntityProvider(replacementProvider);

    expect(getEntityProvider('release')).toBeUndefined();
  });
});
