/**
 * CI control plane — single import surface for pure merge-gate / risk / queue
 * decisions. Prefer this module over deep imports when adding characterization
 * tests or operator tooling so the control plane stays discoverable.
 *
 * Source of truth for job/risk policy: `.github/ci-harness/manifest.json`
 * Source of truth for branch-protection aggregates: `merge-queue-guard.mjs`
 */
export {
  buildCiHarnessArtifact,
  classifyCiRisk,
  DEFAULT_MANIFEST_PATH,
  generateCiHarnessDocs,
  generateDocsFiles,
  HARNESS_SCHEMA_VERSION,
  listMergeGateJobs,
  listRiskRuleContracts,
  loadCiHarnessManifest,
  normalizeChangedFiles,
  riskLocalCommands,
  validateCiHarnessManifest,
} from './ci-harness.mjs';

export {
  ALLOWED_REQUIRED_CHECK_CONTEXTS,
  FORBIDDEN_PINNED_JOB_CONTEXTS,
  GRAPHITE_QUEUE_POLICY,
  parseRequiredStatusChecksFromYaml,
  preQueueFreshnessDecision,
  REQUIRED_MERGE_STATUSES,
  requiredStatusDecision,
  validateAggregateRequiredChecks,
  validateMergeQueueRepoConfig,
} from './merge-queue-guard.mjs';
