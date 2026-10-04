import type { PlaybookAutonomy, PlaybookStep } from './types';

/**
 * Agent workflows that ship today and can run a playbook step. A template
 * may only reference these in `agentAssist`; registry.test.ts enforces it.
 * Add an id here only when its workflow runs in production.
 */
export const SHIPPED_AGENT_WORKFLOWS: ReadonlySet<string> = new Set([
  'metadata-agent-run',
  'smart-link-create',
  'profile-feature-release',
  'fan-notification-send',
]);

/**
 * The autonomy a step actually gets in a run. A step with no shipped agent
 * is hands-on whatever the run asks for, so the product never claims an
 * agent did work that a person has to do.
 */
export function resolveStepAutonomy(
  runAutonomy: PlaybookAutonomy,
  step: Pick<PlaybookStep, 'agentAssist'>
): PlaybookAutonomy {
  const agentType = step.agentAssist?.agentType;
  if (!agentType || !SHIPPED_AGENT_WORKFLOWS.has(agentType)) {
    return 'hands_on';
  }
  return runAutonomy;
}
