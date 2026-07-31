import { describe, expect, it } from 'vitest';
import type {
  ProfileWorkspaceConnectorRow,
  ProfileWorkspaceSurfaceRow,
} from '@/app/app/(shell)/profiles/data';
import {
  filterProfileWorkspaceRows,
  getConnectionStatus,
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
    lastObservedAt: '2026-07-30T00:00:00.000Z',
    primaryIssue: 'Active',
    primaryAction: 'open',
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
    primaryIssue: 'Active',
    primaryAction: 'open',
    ...overrides,
  };
}

describe('connections workspace helpers', () => {
  it('keeps Sources, Websites, Connectors, and Jovie as distinct filters', () => {
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
      connector(),
    ];

    expect(
      filterProfileWorkspaceRows(rows, 'source').map(row => row.id)
    ).toEqual(['source']);
    expect(
      filterProfileWorkspaceRows(rows, 'website').map(row => row.id)
    ).toEqual(['website']);
    expect(
      filterProfileWorkspaceRows(rows, 'connector').map(row => row.id)
    ).toEqual(['gmail']);
    expect(
      filterProfileWorkspaceRows(rows, 'jovie').map(row => row.id)
    ).toEqual(['jovie']);
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
        primaryAction: 'reconnect',
      }),
    ];

    expect(summarizeProfileWorkspaceRows(rows)).toEqual({
      connectionCount: 3,
      needsAttentionCount: 1,
      bestRank: 4,
      monitoringLabel: 'Active',
    });
  });
});
