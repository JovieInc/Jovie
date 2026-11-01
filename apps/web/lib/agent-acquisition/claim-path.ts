/** Client-safe path builder for the agent draft claim page (JOV-9760). */
export const AGENT_CLAIM_PATH_PREFIX = '/claim/agent';

export function agentClaimPath(draftId: string, handoff: string): string {
  return `${AGENT_CLAIM_PATH_PREFIX}/${encodeURIComponent(draftId)}?h=${encodeURIComponent(handoff)}`;
}
