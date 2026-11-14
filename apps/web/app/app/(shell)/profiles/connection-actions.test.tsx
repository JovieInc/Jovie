import { describe, expect, it, vi } from 'vitest';
import { buildConnectionActions } from './connection-actions';
import type { ProfileWorkspaceRow } from './data';

const spotify: ProfileWorkspaceRow = {
  id: 'spotify',
  rowType: 'surface',
  kind: 'dsp',
  platform: 'spotify',
  label: 'Spotify',
  handle: 'Tim White',
  url: 'https://open.spotify.com/artist/tim',
  trackedUrl: 'https://jov.ie/tim/s/spotify',
  qualificationStatus: 'qualified',
  isOfficial: true,
  monitoringState: 'locked',
  rank: 7,
  previousRank: 9,
  lastObservedAt: '2026-07-16T00:00:00.000Z',
};

describe('buildConnectionActions', () => {
  it('offers contextual Ask Jovie on every entity and Edit only on the Jovie profile', () => {
    const callbacks = {
      onViewDetails: vi.fn(),
      onOpen: vi.fn(),
      onPrimaryAction: vi.fn(),
      onAskJovie: vi.fn(),
      onEditProfile: vi.fn(),
    };
    const jovie: ProfileWorkspaceRow = {
      ...spotify,
      id: 'jovie',
      kind: 'jovie',
      platform: 'jovie',
    };
    for (const row of [spotify, jovie]) {
      const actions = buildConnectionActions(row, 'open', callbacks);
      const ask = actions.find(
        action => 'id' in action && action.id === 'ask-jovie'
      );
      if (!ask || !('onClick' in ask)) throw new Error('Missing Ask Jovie');
      ask.onClick();
      expect(callbacks.onAskJovie).toHaveBeenLastCalledWith(row);
      const edit = actions.find(
        action => 'id' in action && action.id === 'edit-profile'
      );
      if (row.kind === 'jovie') {
        if (!edit || !('onClick' in edit))
          throw new Error('Missing Edit Profile');
        edit.onClick();
        expect(callbacks.onEditProfile).toHaveBeenCalledWith(jovie);
      } else expect(edit).toBeUndefined();
    }
  });
  it('builds one action contract for row, ellipsis, and right rail menus', () => {
    const callbacks = {
      onViewDetails: vi.fn(),
      onOpen: vi.fn(),
      onPrimaryAction: vi.fn(),
    };

    const actions = buildConnectionActions(spotify, 'upgrade', callbacks);

    expect(
      actions.flatMap(action => ('label' in action ? [action.label] : []))
    ).toEqual(['View Details', 'Open Profile', 'Upgrade Monitoring']);

    const upgrade = actions.find(
      action => 'id' in action && action.id === 'connection-upgrade'
    );
    if (!upgrade || !('onClick' in upgrade)) {
      throw new Error('Expected the upgrade action');
    }
    upgrade.onClick();
    expect(callbacks.onPrimaryAction).toHaveBeenCalledWith(spotify);
  });

  it('does not duplicate the primary action when opening is already primary', () => {
    const actions = buildConnectionActions(spotify, 'open', {
      onViewDetails: vi.fn(),
      onOpen: vi.fn(),
      onPrimaryAction: vi.fn(),
    });

    expect(actions).toHaveLength(2);
    expect(actions).not.toContainEqual({ type: 'separator' });
  });

  it('adds Fix With Jovie only when a fix callback is supplied', () => {
    const onFix = vi.fn();
    const base = {
      onViewDetails: vi.fn(),
      onOpen: vi.fn(),
      onPrimaryAction: vi.fn(),
    };
    const labels = (actions: ReturnType<typeof buildConnectionActions>) =>
      actions.flatMap(a => ('label' in a ? [a.label] : []));
    expect(labels(buildConnectionActions(spotify, 'open', base))).not.toContain(
      'Fix With Jovie'
    );
    const withFix = buildConnectionActions(spotify, 'open', { ...base, onFix });
    expect(labels(withFix)).toContain('Fix With Jovie');
    const fix = withFix.find(a => 'id' in a && a.id === 'connection-fix');
    if (!fix || !('onClick' in fix)) throw new Error('Expected fix action');
    fix.onClick();
    expect(onFix).toHaveBeenCalledWith(spotify);
  });
});

describe('saved link removal actions', () => {
  const callbacks = {
    onViewDetails: vi.fn(),
    onOpen: vi.fn(),
    onPrimaryAction: vi.fn(),
    onRemoveLink: vi.fn(),
  };
  const removable = {
    ...spotify,
    removalTarget: { linkId: 'saved-link', url: spotify.url, version: 2 },
  };
  it('uses the same exact source target across menu consumers', () => {
    const actions = buildConnectionActions(removable, 'open', callbacks);
    const action = actions.find(
      item => 'id' in item && item.id === 'remove-profile-link'
    );
    expect(action).toMatchObject({
      label: 'Remove From Jovie Profile',
      destructive: true,
    });
    if (!action || !('onClick' in action)) throw new Error('Missing removal');
    action.onClick();
    expect(callbacks.onRemoveLink).toHaveBeenCalledWith(removable);
  });
  it.each([
    spotify,
    { ...removable, kind: 'jovie' as const },
    { ...removable, id: 'preview:link' },
  ])('excludes non-removable row $id', row => {
    expect(
      buildConnectionActions(row, 'open', callbacks).some(
        item => 'id' in item && item.id === 'remove-profile-link'
      )
    ).toBe(false);
  });
});
