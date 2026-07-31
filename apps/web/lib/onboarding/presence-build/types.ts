import type { PersistedToolEvent } from '@/lib/chat/tool-events';
import type {
  ONBOARDING_PRESENCE_BUILD_WORKFLOW_KIND,
  PresenceBuildStepId,
} from './constants';

export type PresenceBuildStepStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'skipped'
  | 'failed';

export interface PresenceBuildFact {
  readonly label: string;
  readonly value: string;
}

export interface PresenceBuildArtifact {
  readonly title: string;
  readonly summary: string;
  readonly facts: readonly PresenceBuildFact[];
  /** Absolute or path URL the user can open when present. */
  readonly href?: string;
  /** Copyable draft body (welcome post / pitch). */
  readonly draftText?: string;
  /** True when the step ran but found nothing to surface (not a failure). */
  readonly empty?: boolean;
}

export interface PresenceBuildStepState {
  readonly id: PresenceBuildStepId;
  readonly status: PresenceBuildStepStatus;
  readonly artifact?: PresenceBuildArtifact;
  readonly error?: string;
  readonly completedAt?: string;
}

export interface PresenceBuildStepOutputs {
  readonly kind: typeof ONBOARDING_PRESENCE_BUILD_WORKFLOW_KIND;
  readonly schemaVersion: 1;
  readonly profileId: string;
  readonly conversationId: string;
  readonly messageId: string;
  readonly userId: string;
  readonly steps: Record<PresenceBuildStepId, PresenceBuildStepState>;
  readonly toolEvents: PersistedToolEvent[];
}

export function isPresenceBuildStepOutputs(
  value: unknown
): value is PresenceBuildStepOutputs {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.kind === 'onboarding_presence_build' &&
    record.schemaVersion === 1 &&
    typeof record.profileId === 'string' &&
    typeof record.conversationId === 'string' &&
    typeof record.messageId === 'string' &&
    typeof record.userId === 'string' &&
    typeof record.steps === 'object' &&
    record.steps !== null &&
    Array.isArray(record.toolEvents)
  );
}
