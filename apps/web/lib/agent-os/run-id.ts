/**
 * Shared run-id validation for agent-os path helpers.
 * Single source of truth for the run-id format used across design-taste-jury,
 * visual-qa, and future agent-os subsystems.
 */

const RUN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/i;

export function assertValidAgentOsRunId(
  runId: string,
  label = 'run id'
): string {
  const safeRunId = runId.trim();
  if (!RUN_ID_PATTERN.test(safeRunId)) {
    throw new Error(`Invalid agent-os ${label}: ${runId}`);
  }

  return safeRunId;
}
