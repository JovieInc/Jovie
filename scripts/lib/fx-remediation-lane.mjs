/**
 * Pinned FX CLI identity for the GitHub Actions remediation lane.
 *
 * `provider` is the configured gateway route and `observedModel` is the model
 * reported by FX. The identity basis records that distinction explicitly.
 * `maxSteps` is the enforced `FX_MAX_AGENT_STEPS` cap; `stepsUsed` is observed.
 */
export const FX_EXECUTOR_POLICY = Object.freeze({
  kind: 'fx-cli',
  version: '0.0.7',
  archiveSha256:
    'c5787ea041d3b5521ec675f1ada78f30cf1b11021ffcac48b4969cf5beb65c45',
  provider: 'vercel-ai-gateway',
  route: 'github-actions-fx',
  identityBasis: 'configured-gateway-and-observed-model',
  expectedModel: 'openai/gpt-5.6-luna',
  modelSubstitutionPolicy: 'reject-observed-mismatch',
  maxSteps: 12,
  stepLimitBasis: 'FX_MAX_AGENT_STEPS',
});

/**
 * Validate the FX runner's configured identity and model observation.
 *
 * @param {any} executor
 * @returns {boolean}
 */
export function validateFxExecutorIdentity(executor) {
  if (!executor || typeof executor !== 'object' || Array.isArray(executor)) {
    return false;
  }

  const validObservedSteps =
    Number.isSafeInteger(executor.stepsUsed) &&
    executor.stepsUsed >= 0 &&
    executor.stepsUsed <= FX_EXECUTOR_POLICY.maxSteps;

  return (
    executor.kind === FX_EXECUTOR_POLICY.kind &&
    executor.version === FX_EXECUTOR_POLICY.version &&
    executor.archiveSha256 === FX_EXECUTOR_POLICY.archiveSha256 &&
    executor.provider === FX_EXECUTOR_POLICY.provider &&
    executor.route === FX_EXECUTOR_POLICY.route &&
    executor.identityBasis === FX_EXECUTOR_POLICY.identityBasis &&
    executor.expectedModel === FX_EXECUTOR_POLICY.expectedModel &&
    executor.observedModel === executor.expectedModel &&
    executor.modelSubstitutionPolicy ===
      FX_EXECUTOR_POLICY.modelSubstitutionPolicy &&
    executor.maxSteps === FX_EXECUTOR_POLICY.maxSteps &&
    executor.stepLimitBasis === FX_EXECUTOR_POLICY.stepLimitBasis &&
    validObservedSteps
  );
}
