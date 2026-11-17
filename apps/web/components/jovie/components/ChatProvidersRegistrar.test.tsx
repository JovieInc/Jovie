import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getEntityProvider,
  listRegisteredKinds,
} from '@/lib/commands/entities';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ChatProvidersRegistrar } from './ChatProvidersRegistrar';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ChatProvidersRegistrar', () => {
  it('registers the release, artist and event providers for the profile and renders nothing', async () => {
    const { container, unmount } = render(
      <main>
        <ChatProvidersRegistrar profileId='profile-1' />
      </main>
    );

    expect(container.querySelector('main')).toBeEmptyDOMElement();
    expect(getEntityProvider('release')?.registryKey).toBe('release:profile-1');
    expect(getEntityProvider('event')?.registryKey).toBe('event:profile-1');
    expect(getEntityProvider('artist')?.registryKey).toBe(
      'artist:spotify-search'
    );
    await expectNoA11yViolations(container);
    unmount();
  });

  it('swaps the profile-scoped providers when the profile changes, without a replacement warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { rerender, unmount } = render(
      <ChatProvidersRegistrar profileId='profile-1' />
    );

    rerender(<ChatProvidersRegistrar profileId='profile-2' />);

    expect(getEntityProvider('release')?.registryKey).toBe('release:profile-2');
    expect(getEntityProvider('event')?.registryKey).toBe('event:profile-2');
    expect(warn).not.toHaveBeenCalled();
    unmount();
  });

  it('keeps the same providers across a re-render with the same profile', () => {
    const { rerender, unmount } = render(
      <ChatProvidersRegistrar profileId='profile-1' />
    );
    const release = getEntityProvider('release');
    const event = getEntityProvider('event');

    rerender(<ChatProvidersRegistrar profileId='profile-1' />);

    expect(getEntityProvider('release')).toBe(release);
    expect(getEntityProvider('event')).toBe(event);
    unmount();
  });

  it('unregisters every provider it registered on unmount', () => {
    const { unmount } = render(
      <ChatProvidersRegistrar profileId='profile-1' />
    );
    expect(listRegisteredKinds()).toEqual(
      expect.arrayContaining(['release', 'artist', 'event'])
    );

    unmount();

    expect(getEntityProvider('release')).toBeUndefined();
    expect(getEntityProvider('artist')).toBeUndefined();
    expect(getEntityProvider('event')).toBeUndefined();
  });
});
