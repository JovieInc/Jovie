import { describe, expect, it } from 'vitest';
import type {
  ProfileWorkspaceConnectorRow,
  ProfileWorkspaceSurfaceRow,
} from '@/app/app/(shell)/profiles/data';
import { PRESENCE_STALE_AFTER_MS } from './presence-identity';
import {
  filterProfileWorkspaceRows,
  getConnectionPrimaryAction,
  getConnectionStatus,
  selectPresenceReviewRows,
  sortProfileWorkspaceRows,
  summarizeProfileWorkspaceRows,
} from './workspace';

function surface(
  overrides: Partial<ProfileWorkspaceSurfaceRow> = {}
): ProfileWorkspaceSurfaceRow {
  return {
    id: 'spotify',
    rowType: 'surface',
    kind: 'dsp',
    platform: 'spotify',
    label: 'Spotify',
    handle: 'Artist',
    url: 'https://open.spotify.com/artist/example',
    trackedUrl: null,
    qualificationStatus: 'qualified',
    isOfficial: true,
    monitoringState: 'active',
    rank: 4,
    previousRank: 6,
    lastObservedAt: '2026-09-16T00:00:00.000Z',
    ...overrides,
  };
}

function connector(
  overrides: Partial<ProfileWorkspaceConnectorRow> = {}
): ProfileWorkspaceConnectorRow {
  return {
    id: 'gmail',
    rowType: 'connector',
    kind: 'connector',
    platform: 'gmail',
    label: 'Gmail',
    handle: 'artist@example.com',
    url: '/app/settings/connectors',
    status: 'connected',
    monitoringState: 'active',
    ...overrides,
  };
}

describe('connections workspace helpers', () => {
  it('does not claim healthy monitoring during an unavailable search provider', () => {
    expect(getConnectionStatus(surface(), false)).toMatchObject({
      label: 'Search Unavailable',
      tone: 'neutral',
      needsAttention: false,
    });
    expect(
      getConnectionStatus(surface({ qualificationStatus: 'suggested' }), false)
        .label
    ).toBe('Needs Qualification');
    expect(getConnectionStatus(connector(), false).label).toBe('Active');
  });

  it('selects only persisted identity work, independent of monitoring and provider state', () => {
    const rows = [
      ...(['active', 'paused', 'locked', 'unavailable'] as const).flatMap(
        monitoringState => [
          surface({
            id: `suggested-${monitoringState}`,
            qualificationStatus: 'suggested',
            monitoringState,
          }),
          surface({ id: `qualified-${monitoringState}`, monitoringState }),
        ]
      ),
      surface({ id: 'conflict', qualificationStatus: 'conflicting' }),
      surface({ id: 'rejected', qualificationStatus: 'rejected' }),
      surface({ id: 'preview:unsaved', qualificationStatus: 'suggested' }),
      connector({ status: 'needs_reauth' }),
    ];
    expect(selectPresenceReviewRows(rows).map(row => row.id)).toEqual([
      'suggested-active',
      'suggested-paused',
      'suggested-locked',
      'suggested-unavailable',
      'conflict',
    ]);
    expect(selectPresenceReviewRows([])).toEqual([]);
    expect(selectPresenceReviewRows([surface(), connector()])).toEqual([]);
  });

  it('groups Presence filters by artist outcome (JOV-6170)', () => {
    const rows = [
      surface({
        id: 'source',
        kind: 'authority',
        platform: 'musicbrainz',
      }),
      surface({
        id: 'website',
        kind: 'website',
        platform: 'website',
      }),
      surface({ id: 'jovie', kind: 'jovie', platform: 'jovie' }),
      surface({ id: 'dsp-row', kind: 'dsp', platform: 'spotify' }),
      surface({ id: 'social-row', kind: 'social', platform: 'instagram' }),
    ];

    expect(
      filterProfileWorkspaceRows(rows, 'identity').map(row => row.id)
    ).toEqual(['website', 'jovie']);
    expect(
      filterProfileWorkspaceRows(rows, 'profiles').map(row => row.id)
    ).toEqual(['dsp-row', 'social-row']);
    expect(
      filterProfileWorkspaceRows(rows, 'catalog').map(row => row.id)
    ).toEqual(['source']);
  });

  it('surfaces actionable connection issues before healthy rows', () => {
    const conflicting = surface({
      id: 'conflicting',
      label: 'Duplicate Spotify',
      qualificationStatus: 'conflicting',
    });
    const locked = surface({
      id: 'locked',
      platform: 'apple_music',
      label: 'Apple Music',
      monitoringState: 'locked',
      rank: null,
      previousRank: null,
    });
    const active = surface();

    expect(
      sortProfileWorkspaceRows([active, locked, conflicting]).map(row => row.id)
    ).toEqual(['conflicting', 'locked', 'spotify']);
    expect(getConnectionStatus(conflicting).label).toBe('Needs Review');
    expect(getConnectionStatus(locked).label).toBe('Limit Reached');
  });

  it('orders broken, limited, measured, then unmeasured connections', () => {
    const notConnected = connector({ status: 'not_connected' });
    const limited = surface({
      id: 'limited',
      monitoringState: 'locked',
      rank: null,
      previousRank: null,
    });
    const measured = surface({ id: 'measured', rank: 4 });
    const unmeasured = surface({
      id: 'unmeasured',
      rank: null,
      previousRank: null,
      lastObservedAt: null,
    });

    expect(
      sortProfileWorkspaceRows([
        unmeasured,
        measured,
        limited,
        notConnected,
      ]).map(row => row.id)
    ).toEqual(['gmail', 'limited', 'measured', 'unmeasured']);
  });

  it('derives actions from the resolved connection state', () => {
    expect(getConnectionPrimaryAction(connector({ status: 'error' }))).toBe(
      'reconnect'
    );
    expect(
      getConnectionPrimaryAction(surface({ monitoringState: 'unavailable' }))
    ).toBe('review');
    expect(
      getConnectionPrimaryAction(surface({ monitoringState: 'paused' }))
    ).toBe('review');
    expect(
      getConnectionPrimaryAction(surface({ monitoringState: 'locked' }))
    ).toBe('upgrade');
  });

  it.each(['suggested', 'conflicting'] as const)(
    'requires identity review before an upgrade for a locked %s page (JOV-6343)',
    qualificationStatus => {
      const row = surface({ qualificationStatus, monitoringState: 'locked' });

      expect(getConnectionPrimaryAction(row)).toBe('review');
      expect(getConnectionStatus(row).label).toBe(
        qualificationStatus === 'suggested'
          ? 'Needs Qualification'
          : 'Needs Review'
      );
      expect(row.monitoringState).toBe('locked');
      expect(
        getConnectionPrimaryAction({ ...row, qualificationStatus: 'qualified' })
      ).toBe('upgrade');
    }
  );

  it('keeps duplicate connection labels as distinct URL-backed rows', () => {
    const first = surface({
      id: 'first',
      label: 'Artist',
      url: 'https://example.com/artist',
    });
    const second = surface({
      id: 'second',
      label: 'Artist',
      url: 'https://example.org/artist',
    });

    expect(
      sortProfileWorkspaceRows([second, first]).map(row => row.id)
    ).toEqual(['first', 'second']);
  });

  it('never reports monitoring as paused while an active surface exists', () => {
    const rows = [
      surface(),
      surface({
        id: 'paused',
        platform: 'soundcloud',
        monitoringState: 'paused',
        rank: null,
      }),
      connector({
        status: 'needs_reauth',
        monitoringState: 'paused',
      }),
    ];

    expect(summarizeProfileWorkspaceRows(rows)).toEqual({
      connectionCount: 3,
      needsAttentionCount: 1,
      bestRank: 4,
      monitoringLabel: 'Active',
    });
  });

  it('reports monitoring unavailable when the search provider is disabled', () => {
    expect(
      summarizeProfileWorkspaceRows([surface()], false).monitoringLabel
    ).toBe('Unavailable');
    expect(
      summarizeProfileWorkspaceRows(
        [surface({ monitoringState: 'paused' })],
        false
      ).monitoringLabel
    ).toBe('Unavailable');
  });

  it('reports paused, limited, and idle monitoring without an active surface', () => {
    expect(
      summarizeProfileWorkspaceRows([
        surface({ id: 'paused', monitoringState: 'paused', rank: null }),
      ]).monitoringLabel
    ).toBe('Paused');
    expect(
      summarizeProfileWorkspaceRows([
        surface({ id: 'locked', monitoringState: 'locked', rank: null }),
      ]).monitoringLabel
    ).toBe('Limited');
    expect(
      summarizeProfileWorkspaceRows([
        surface({
          id: 'idle',
          monitoringState: 'unavailable',
          rank: null,
        }),
      ]).monitoringLabel
    ).toBe('Unavailable');
  });

  it('treats stale observations as attention, not a zero score', () => {
    const stale = surface({
      id: 'stale',
      rank: 3,
      lastObservedAt: new Date(
        Date.now() - PRESENCE_STALE_AFTER_MS - 1
      ).toISOString(),
    });
    const pending = surface({
      id: 'pending',
      rank: null,
      previousRank: null,
      lastObservedAt: null,
    });

    expect(getConnectionStatus(stale)).toMatchObject({
      label: 'Stale',
      needsAttention: true,
    });
    expect(getConnectionStatus(pending)).toMatchObject({
      label: 'Not Measured',
      needsAttention: false,
    });
  });
});
