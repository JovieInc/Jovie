import { describe, expect, it } from 'vitest';
import type {
  ProfileWorkspaceConnectorRow,
  ProfileWorkspaceSurfaceRow,
} from '@/app/app/(shell)/profiles/data';
import {
  derivePresenceInspector,
  PRESENCE_INSPECTOR_GROUPS,
  type PresenceInspectorSectionKey,
} from './presence-inspector';

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
    lastObservedAt: new Date().toISOString(),
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

function sectionKeys(
  row: ProfileWorkspaceSurfaceRow | ProfileWorkspaceConnectorRow,
  providerAvailable = true
): readonly PresenceInspectorSectionKey[] {
  return derivePresenceInspector(row, providerAvailable).sections.map(
    section => section.key
  );
}

describe('presence inspector content (JOV-8106)', () => {
  it('orders sections evidence → next action → metadata under the identity header', () => {
    const model = derivePresenceInspector(surface());

    expect(PRESENCE_INSPECTOR_GROUPS).toEqual([
      'identity',
      'evidence',
      'next_action',
      'metadata',
    ]);
    expect(model.sections.map(section => section.key)).toEqual([
      'observation_summary',
      'source_identity',
      'signals',
      'actions',
      'object_facts',
    ]);
    const groupRanks = model.sections.map(section =>
      PRESENCE_INSPECTOR_GROUPS.indexOf(section.group)
    );
    expect(groupRanks).toEqual([...groupRanks].sort((a, b) => a - b));
  });

  it('puts the identity question ahead of every other action', () => {
    const keys = sectionKeys(
      surface({ qualificationStatus: 'suggested', monitoringState: 'locked' })
    );

    expect(keys).toContain('identity_check');
    expect(keys.indexOf('identity_check')).toBeLessThan(
      keys.indexOf('actions')
    );
    expect(keys.indexOf('actions')).toBeLessThan(keys.indexOf('object_facts'));
  });

  it('keeps evidence ahead of metadata for connectors', () => {
    expect(sectionKeys(connector())).toEqual([
      'observation_summary',
      'signals',
      'actions',
      'object_facts',
    ]);
  });

  it('collapses to actions plus diagnostics metadata when search is unavailable', () => {
    const keys = sectionKeys(surface(), false);

    expect(keys).toEqual(['source_identity', 'actions', 'monitoring_details']);
  });

  it('exposes the resolved status, signals, and primary action for the rail', () => {
    const row = surface({ monitoringState: 'locked' });
    const model = derivePresenceInspector(row);

    expect(model.status.label).toBe('Limit Reached');
    expect(model.primaryAction).toBe('upgrade');
    expect(model.signals.length).toBeGreaterThan(0);
    expect(model.needsIdentityDecision).toBe(false);
  });
});
