import { describe, expect, it, vi } from 'vitest';
import { convertToCommonDropdownItems } from '@/components/organisms/table';
import type { ReleaseViewModel } from '@/lib/discography/types';
import {
  buildReleaseActions,
  type ReleaseActionCapabilities,
} from './release-actions';

describe('shared release action capabilities', () => {
  it('preserves the target, destructive intent and lock through rail conversion', () => {
    const release: ReleaseViewModel = {
      id: 'release-1',
      profileId: 'profile-1',
      title: 'Test release',
      slug: 'test-release',
      status: 'draft',
      releaseType: 'single',
      isExplicit: false,
      releaseDate: '2026-10-21',
      totalTracks: 1,
      providers: [],
      spotifyPopularity: null,
      smartLinkPath: '/r/test-release',
      previewUrl: null,
      primaryIsrc: null,
      upc: null,
    };
    const capabilities: ReleaseActionCapabilities = {
      onDelete: vi.fn(),
      onChangeStatus: vi.fn(),
      isSmartLinkLocked: vi.fn(() => true),
      getSmartLinkLockReason: vi.fn(() => 'cap' as const),
    };
    const items = convertToCommonDropdownItems(
      buildReleaseActions({
        release,
        onEdit: vi.fn(),
        onCopy: vi.fn(),
        ...capabilities,
      })
    );

    expect(capabilities.isSmartLinkLocked).toHaveBeenCalledWith(release.id);
    expect(capabilities.getSmartLinkLockReason).toHaveBeenCalledWith(
      release.id
    );
    expect(items.find(item => item.id === 'copy-smart-link')).toMatchObject({
      disabled: true,
      label: 'Smart link (Pro)',
    });

    const deletion = items.find(item => item.id === 'delete');
    expect(deletion).toMatchObject({ type: 'action', variant: 'destructive' });
    if (deletion?.type !== 'action') throw new Error('Missing delete action');
    deletion.onClick();
    expect(capabilities.onDelete).toHaveBeenCalledExactlyOnceWith(release.id);

    const status = items.find(item => item.id === 'release-status');
    if (status?.type !== 'submenu') throw new Error('Missing status submenu');
    const released = status.items.find(item => item.id === 'status-released');
    if (released?.type !== 'action') throw new Error('Missing released action');
    released.onClick();
    expect(capabilities.onChangeStatus).toHaveBeenCalledExactlyOnceWith(
      release,
      'released'
    );
  });
});
