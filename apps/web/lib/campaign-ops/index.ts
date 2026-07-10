/**
 * Campaign ops domain — production logic for the founder demo campaign loop.
 *
 * Issues: JOV-2205, JOV-2207, JOV-2208, JOV-2209, JOV-2210, JOV-2212, JOV-2213
 */

export {
  APPROVAL_STEP_ORDER,
  buildApprovalIdempotencyKey,
  createApprovalWorkflow,
  markStepFailed,
  markStepRunning,
  markStepSucceeded,
  nextPendingStep,
  retryFailedStep,
  runApprovalSteps,
  startOrResumeApproval,
  workflowHasHiddenInconsistency,
} from './approval-orchestrator';
export {
  buildSignalDedupeKey,
  collapseSignalsToOpportunities,
  detectOpportunitiesFromSignals,
  normalizeExternalSignal,
  utcDayKey,
} from './external-signals';
export {
  evaluateSegmentMember,
  isStableSegmentDefinition,
  previewSegment,
  WARM_TRANCE_SEGMENT,
} from './fan-segments';
export {
  buildProductPageKey,
  canTransitionDrop,
  createDraftDrop,
  isDropVisibleInCampaignStatus,
  transitionDrop,
  upsertDraftDrop,
} from './merch-drop-workflow';
export {
  buildCampaignHealthSnapshot,
  computeConversionRate,
  computeReplyRate,
  DEFAULT_MONITORING_THRESHOLDS,
  pauseMonitoring,
  recommendNextMoves,
  resumeMonitoring,
} from './monitoring';
export {
  buildCampaignRecommendations,
  computeExpectedMarginCents,
  computeExpectedOrders,
  computeExpectedRevenueCents,
  DEMO_PRODUCT_ASSUMPTIONS,
} from './recommendations';
export {
  buildTaskDedupeKey,
  createReleaseWorkflow,
  DEFAULT_SINGLE_RELEASE_PLAYBOOK,
  expandPlaybookToTasks,
  importReleasePlaybook,
  mergeWorkflowTasks,
} from './release-workflow';
export type * from './types';
