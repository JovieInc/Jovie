import type { HudDeploymentState, HudDeployments } from '@/types/hud';

/**
 * Tone values for deployment status display
 */
export type DeploymentTone = 'good' | 'warning' | 'bad' | 'neutral';

/**
 * Map of deployment states to their display tones
 */
const DEPLOYMENT_STATE_TONE: Record<HudDeploymentState, DeploymentTone> = {
  success: 'good',
  in_progress: 'warning',
  failure: 'bad',
  unknown: 'neutral',
  not_configured: 'neutral',
};

/**
 * Gets the display tone for deployment status.
 *
 * Returns 'neutral' if deployments are not configured,
 * otherwise returns the tone based on the current deployment state.
 */
export function getDeploymentTone(deployments: HudDeployments): DeploymentTone {
  if (deployments.availability === 'not_configured') {
    return 'neutral';
  }

  const currentStatus = deployments.current?.status;
  if (!currentStatus) {
    return 'neutral';
  }

  return DEPLOYMENT_STATE_TONE[currentStatus] ?? 'neutral';
}

/**
 * Map of deployment availability to their labels
 */
const AVAILABILITY_LABELS: Record<string, string> = {
  not_configured: 'Deploy: not configured',
  error: 'Deploy: error',
};

/**
 * Gets the display label for deployment status.
 *
 * Returns appropriate label based on availability and current status.
 */
export function getDeploymentLabel(deployments: HudDeployments): string {
  const availabilityLabel = AVAILABILITY_LABELS[deployments.availability];
  if (availabilityLabel) {
    return availabilityLabel;
  }

  if (deployments.current) {
    return `Deploy: ${deployments.current.status}`;
  }

  return 'Deploy: unknown';
}
