import { describe, expect, it } from 'vitest';
import { getDeploymentLabel } from '@/lib/hud/tone-determination';
import type { HudDeploymentState, HudDeployments } from '@/types/hud';

function deployments(status: HudDeploymentState): HudDeployments {
  return {
    availability: 'available',
    recent: [],
    current: {
      id: 1,
      runNumber: 1,
      status,
      createdAtIso: '2026-10-02T12:00:00Z',
      branch: 'main',
      url: null,
    },
  };
}

describe('deployment display labels', () => {
  it.each([
    ['in_progress', 'in progress'],
    ['not_configured', 'not configured'],
    ['success', 'successful'],
    ['failure', 'failed'],
    ['unknown', 'unknown'],
  ] as const)('renders %s as readable copy', (status, label) => {
    expect(getDeploymentLabel(deployments(status))).toBe(`Deploy: ${label}`);
  });
  it('keeps availability errors ahead of a previously successful run', () => {
    expect(
      getDeploymentLabel({ ...deployments('success'), availability: 'error' })
    ).toBe('Deploy: error');
  });
});
