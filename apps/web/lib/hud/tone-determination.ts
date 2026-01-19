import type { HudDeploymentState, HudDeployments } from '@/types/hud';

/**
 * Visual tone indicators for HUD status pills.
 */
export type HudTone = 'good' | 'warning' | 'bad' | 'neutral';

/**
 * Map of deployment status to visual tone.
 */
const DEPLOYMENT_STATUS_TONE_MAP: Record<HudDeploymentState, HudTone> = {
  success: 'good',
  in_progress: 'warning',
  failure: 'bad',
  unknown: 'neutral',
  not_configured: 'neutral',
};

/**
 * Get the visual tone for deployment status.
 */
export function getDeploymentTone(deployments: HudDeployments): HudTone {
  if (deployments.availability === 'not_configured') {
    return 'neutral';
  }
  if (!deployments.current) {
    return 'neutral';
  }
  return DEPLOYMENT_STATUS_TONE_MAP[deployments.current.status] ?? 'neutral';
}

/**
 * Get the display label for deployment status.
 */
export function getDeploymentLabel(deployments: HudDeployments): string {
  if (deployments.availability === 'not_configured') {
    return 'Deploy: not configured';
  }
  if (deployments.availability === 'error') {
    return 'Deploy: error';
  }
  if (deployments.current) {
    return `Deploy: ${deployments.current.status}`;
  }
  return 'Deploy: unknown';
}

/**
 * Get the visual tone for default alive/dead status.
 */
export function getDefaultStatusTone(defaultStatus: 'alive' | 'dead'): HudTone {
  return defaultStatus === 'alive' ? 'good' : 'bad';
}
