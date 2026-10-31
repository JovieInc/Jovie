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
