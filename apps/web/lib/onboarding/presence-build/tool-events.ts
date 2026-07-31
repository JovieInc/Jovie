import type { PersistedToolEvent } from '@/lib/chat/tool-events';
import {
  PRESENCE_BUILD_STEPS,
  PRESENCE_BUILD_TOOL_NAMES,
  type PresenceBuildStepId,
} from './constants';
import type { PresenceBuildArtifact, PresenceBuildStepState } from './types';

function toolCallIdForStep(stepId: PresenceBuildStepId): string {
  return `presence-build:${stepId}`;
}

export function buildRunningToolEvent(
  stepId: PresenceBuildStepId
): PersistedToolEvent {
  return {
    schemaVersion: 2,
    toolCallId: toolCallIdForStep(stepId),
    toolName: PRESENCE_BUILD_TOOL_NAMES[stepId],
    state: 'running',
    uiHint: 'artifact',
    summary: 'Working…',
    input: { stepId },
  };
}

export function buildInitialPresenceToolEvents(): PersistedToolEvent[] {
  return PRESENCE_BUILD_STEPS.map(buildRunningToolEvent);
}

export function buildSucceededToolEvent(
  stepId: PresenceBuildStepId,
  artifact: PresenceBuildArtifact
): PersistedToolEvent {
  return {
    schemaVersion: 2,
    toolCallId: toolCallIdForStep(stepId),
    toolName: PRESENCE_BUILD_TOOL_NAMES[stepId],
    state: 'succeeded',
    uiHint: 'artifact',
    summary: artifact.summary,
    input: { stepId },
    output: {
      action: 'presence_build_artifact',
      stepId,
      title: artifact.title,
      summary: artifact.summary,
      facts: artifact.facts,
      href: artifact.href,
      draftText: artifact.draftText,
      empty: artifact.empty ?? false,
    },
  };
}

export function buildFailedToolEvent(
  stepId: PresenceBuildStepId,
  errorMessage: string
): PersistedToolEvent {
  return {
    schemaVersion: 2,
    toolCallId: toolCallIdForStep(stepId),
    toolName: PRESENCE_BUILD_TOOL_NAMES[stepId],
    state: 'failed',
    uiHint: 'artifact',
    summary: errorMessage,
    errorMessage,
    retryable: true,
    input: { stepId },
  };
}

export function buildSkippedToolEvent(
  stepId: PresenceBuildStepId,
  summary: string
): PersistedToolEvent {
  return {
    schemaVersion: 2,
    toolCallId: toolCallIdForStep(stepId),
    toolName: PRESENCE_BUILD_TOOL_NAMES[stepId],
    state: 'succeeded',
    uiHint: 'artifact',
    summary,
    input: { stepId },
    output: {
      action: 'presence_build_artifact',
      stepId,
      title: 'Nothing found yet',
      summary,
      facts: [],
      empty: true,
    },
  };
}

export function replaceToolEvent(
  events: readonly PersistedToolEvent[],
  next: PersistedToolEvent
): PersistedToolEvent[] {
  const index = events.findIndex(event => event.toolCallId === next.toolCallId);
  if (index < 0) {
    return [...events, next];
  }
  return events.map((event, i) => (i === index ? next : event));
}

export function initialStepStates(): Record<
  PresenceBuildStepId,
  PresenceBuildStepState
> {
  return {
    research_artist: { id: 'research_artist', status: 'queued' },
    assemble_profile: { id: 'assemble_profile', status: 'queued' },
    generate_smart_link: { id: 'generate_smart_link', status: 'queued' },
    draft_welcome_post: { id: 'draft_welcome_post', status: 'queued' },
  };
}
