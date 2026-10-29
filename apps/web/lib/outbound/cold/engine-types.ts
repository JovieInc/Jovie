import type { ControllerPlan } from './controller';
import type {
  AutoApproveVerdict,
  SegmentLearning,
  StyleGuide,
} from './edit-learning';
import type { SegmentFunnel } from './funnel';

/**
 * One read of the outreach engine for Ovie and Summer: learning metrics and
 * the auto-approve verdict per segment, the send controller's plan, and the
 * funnel with stage dwell per segment. Contains no recipient data.
 * Client-safe: types only.
 */
export interface OutreachEngineStatus {
  readonly schema: 'outreach-engine/v1';
  readonly generatedAt: string;
  readonly learning: readonly SegmentLearning[];
  readonly autoApprove: readonly AutoApproveVerdict[];
  readonly styleGuide: StyleGuide;
  readonly controller: ControllerPlan & {
    readonly blockerLabels: readonly string[];
  };
  readonly funnel: readonly SegmentFunnel[];
}
