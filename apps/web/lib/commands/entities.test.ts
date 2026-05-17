import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EntityKind } from '@/lib/chat/tokens';
import {
  type EntityProvider,
  getEntityProvider,
  listRegisteredKinds,
  registerEntityProvider,
  unregisterEntityProvider,
} from './entities';

const registeredProviders: EntityProvider[] = [];

function makeProvider(
  kind: EntityKind,
  label: string,
  registryKey?: string
): EntityProvider {
  const provider: EntityProvider = {
    kind,
    registryKey,
    label,
    useSearch: () => ({ items: [], isLoading: false }),
    renderChip: () => null,
  };
  registeredProviders.push(provider);
  return provider;
}

afterEach(() => {
  for (const provider of registeredProviders.splice(0)) {
    unregisterEntityProvider(provider);
  }
  vi.restoreAllMocks();
});

describe('entity provider registry', () => {
  it('unregisters the active provider through the registration cleanup', () => {
    const provider = makeProvider('release', 'Releases');
    const unregister = registerEntityProvider(provider);

    expect(getEntityProvider('release')).toBe(provider);
    expect(listRegisteredKinds()).toContain('release');

    unregister();

    expect(getEntityProvider('release')).toBeUndefined();
    expect(listRegisteredKinds()).not.toContain('release');
  });

  it('does not let a stale cleanup unregister a newer provider', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const staleProvider = makeProvider('event', 'Old events');
    const activeProvider = makeProvider('event', 'New events');
    const unregisterStaleProvider = registerEntityProvider(staleProvider);
    registerEntityProvider(activeProvider);

    unregisterStaleProvider();

    expect(getEntityProvider('event')).toBe(activeProvider);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Replacing existing EntityProvider')
    );
  });

  it('keeps duplicate registrations until each cleanup runs', () => {
    const provider = makeProvider('artist', 'Artists');
    const unregisterFirst = registerEntityProvider(provider);
    const unregisterSecond = registerEntityProvider(provider);

    unregisterFirst();

    expect(getEntityProvider('artist')).toBe(provider);

    unregisterSecond();

    expect(getEntityProvider('artist')).toBeUndefined();
  });

  it('ref-counts providers with the same registry key', () => {
    const firstProvider = makeProvider('release', 'Releases', 'release:p1');
    const secondProvider = makeProvider('release', 'Releases', 'release:p1');
    const unregisterFirst = registerEntityProvider(firstProvider);
    const unregisterSecond = registerEntityProvider(secondProvider);

    expect(getEntityProvider('release')).toBe(secondProvider);

    unregisterFirst();

    expect(getEntityProvider('release')).toBe(secondProvider);

    unregisterSecond();

    expect(getEntityProvider('release')).toBeUndefined();
  });
});
