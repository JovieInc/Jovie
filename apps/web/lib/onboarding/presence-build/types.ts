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
  readonly href?: string;
  readonly draftText?: string;
  /** Step ran but found nothing real to surface. */
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
  const r = value as Record<string, unknown>;
  return (
    r.kind === 'onboarding_presence_build' &&
    r.schemaVersion === 1 &&
    typeof r.profileId === 'string' &&
    typeof r.conversationId === 'string' &&
    typeof r.messageId === 'string' &&
    typeof r.userId === 'string' &&
    typeof r.steps === 'object' &&
    r.steps !== null &&
    Array.isArray(r.toolEvents)
  );
}
