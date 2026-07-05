import { APP_ROUTES } from '@/constants/routes';
import { RELEASE_TO_REVENUE_WORKFLOW_KIND } from '@/lib/release-to-revenue/types';

export const JOVIE_WORK_PHASES = [
  'pending',
  'in_progress',
  'completed',
  'failed',
] as const;

export type JovieWorkPhase = (typeof JOVIE_WORK_PHASES)[number];

export const JOVIE_WORK_SOURCES = [
  'workflow_run',
  'agent_run',
  'suggested_action',
  'retouch_job',
  'merch_fulfillment',
  'metadata_submission',
  'fan_notification',
] as const;

export type JovieWorkSource = (typeof JOVIE_WORK_SOURCES)[number];

export const JOVIE_WORK_ICONS = [
  'workflow',
  'agent',
  'approval',
  'retouch',
  'merch',
  'metadata',
  'notification',
] as const;

export type JovieWorkIcon = (typeof JOVIE_WORK_ICONS)[number];

export interface JovieWorkItem {
  id: string;
  source: JovieWorkSource;
  phase: JovieWorkPhase;
  title: string;
  description: string;
  icon: JovieWorkIcon;
  timestamp: string;
  statusLabel: string;
  href?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function humanizeSlug(value: string): string {
  return value
    .split(/[._-]+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function readReleaseTitleFromWorkflowOutputs(
  stepOutputs: unknown
): string | null {
  if (!isRecord(stepOutputs)) {
    return null;
  }

  const release = stepOutputs.release;
  if (!isRecord(release)) {
    return null;
  }

  const title = release.title;
  return typeof title === 'string' && title.trim().length > 0
    ? title.trim()
    : null;
}

function readSuggestedActionTitle(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null;
  }

  const title = payload.title ?? payload.summary ?? payload.name;
  return typeof title === 'string' && title.trim().length > 0
    ? title.trim()
    : null;
}

export function mapWorkflowRunStatusToPhase(status: string): JovieWorkPhase {
  switch (status) {
    case 'waiting_for_approval':
      return 'pending';
    case 'queued':
    case 'running':
      return 'in_progress';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    default:
      return 'in_progress';
  }
}

export function mapAgentRunStatusToPhase(status: string): JovieWorkPhase {
  return mapWorkflowRunStatusToPhase(status);
}

export function mapSuggestedActionStatusToPhase(
  status: string
): JovieWorkPhase {
  switch (status) {
    case 'pending':
      return 'pending';
    case 'approved':
      return 'in_progress';
    case 'executed':
      return 'completed';
    case 'rejected':
    case 'failed':
    case 'expired':
      return 'failed';
    default:
      return 'in_progress';
  }
}

export function mapRetouchJobStatusToPhase(status: string): JovieWorkPhase {
  switch (status) {
    case 'queued':
    case 'running':
    case 'identity_check_retrying':
      return 'in_progress';
    case 'completed':
    case 'accepted_by_user':
      return 'completed';
    case 'identity_check_failed':
    case 'failed':
    case 'rejected_by_user':
      return 'failed';
    default:
      return 'in_progress';
  }
}

export function mapMerchFulfillmentStatusToPhase(
  status: string
): JovieWorkPhase {
  switch (status) {
    case 'queued':
    case 'running':
      return 'in_progress';
    case 'succeeded':
      return 'completed';
    case 'failed':
    case 'blocked':
      return 'failed';
    default:
      return 'in_progress';
  }
}

export function mapMetadataSubmissionStatusToPhase(
  status: string
): JovieWorkPhase {
  switch (status) {
    case 'draft':
    case 'awaiting_approval':
      return 'pending';
    case 'queued':
    case 'sent':
    case 'acknowledged':
      return 'in_progress';
    case 'live':
      return 'completed';
    case 'failed':
    case 'manual_followup_needed':
    case 'drifted':
    case 'cancelled':
      return 'failed';
    default:
      return 'in_progress';
  }
}

export function mapFanNotificationStatusToPhase(
  status: string
): JovieWorkPhase {
  switch (status) {
    case 'pending':
    case 'scheduled':
    case 'sending':
      return 'in_progress';
    case 'sent':
      return 'completed';
    case 'failed':
    case 'cancelled':
      return 'failed';
    default:
      return 'in_progress';
  }
}

export function phaseToStatusLabel(phase: JovieWorkPhase): string {
  switch (phase) {
    case 'pending':
      return 'Needs approval';
    case 'in_progress':
      return 'In progress';
    case 'completed':
      return 'Done';
    case 'failed':
      return 'Failed';
    default:
      return 'In progress';
  }
}

export function mapWorkflowRunToJovieWorkItem(input: {
  id: string;
  kind: string;
  status: string;
  currentStep: string | null;
  stepOutputs: unknown;
  createdAt: Date | string;
  updatedAt: Date | string;
}): JovieWorkItem {
  const phase = mapWorkflowRunStatusToPhase(input.status);
  const releaseTitle = readReleaseTitleFromWorkflowOutputs(input.stepOutputs);

  const title =
    input.kind === RELEASE_TO_REVENUE_WORKFLOW_KIND
      ? 'Release autopilot'
      : humanizeSlug(input.kind);

  const description =
    input.kind === RELEASE_TO_REVENUE_WORKFLOW_KIND
      ? releaseTitle
        ? `Jovie ran release-to-revenue for ${releaseTitle}.`
        : 'Jovie ran release-to-revenue for a release.'
      : input.currentStep
        ? `Workflow step: ${humanizeSlug(input.currentStep)}.`
        : `Workflow ${humanizeSlug(input.kind)}.`;

  const timestamp =
    typeof input.updatedAt === 'string'
      ? input.updatedAt
      : input.updatedAt.toISOString();

  return {
    id: `workflow:${input.id}`,
    source: 'workflow_run',
    phase,
    title,
    description,
    icon: 'workflow',
    timestamp,
    statusLabel: phaseToStatusLabel(phase),
    href: APP_ROUTES.RELEASES,
  };
}

export function mapAgentRunToJovieWorkItem(input: {
  id: string;
  agentSlug: string;
  status: string;
  completedAt: Date | string | null;
  startedAt: Date | string | null;
  createdAt?: Date | string | null;
}): JovieWorkItem {
  const phase = mapAgentRunStatusToPhase(input.status);
  const timestampSource =
    input.completedAt ?? input.startedAt ?? input.createdAt ?? new Date();
  const timestamp =
    typeof timestampSource === 'string'
      ? timestampSource
      : timestampSource.toISOString();

  return {
    id: `agent:${input.id}`,
    source: 'agent_run',
    phase,
    title: humanizeSlug(input.agentSlug),
    description: `Jovie agent ${humanizeSlug(input.agentSlug)} ${phase === 'completed' ? 'finished' : 'ran'}.`,
    icon: 'agent',
    timestamp,
    statusLabel: phaseToStatusLabel(phase),
    href: APP_ROUTES.CHAT,
  };
}

export function mapSuggestedActionToJovieWorkItem(input: {
  id: string;
  kind: string;
  status: string;
  payload: unknown;
  rationale: string | null;
  createdAt: Date | string;
  approvedAt: Date | string | null;
  executedAt: Date | string | null;
}): JovieWorkItem {
  const phase = mapSuggestedActionStatusToPhase(input.status);
  const actionTitle = readSuggestedActionTitle(input.payload);
  const kindLabel =
    input.kind === 'calendar.create_event'
      ? 'Calendar event'
      : humanizeSlug(input.kind);

  const timestampSource =
    input.executedAt ?? input.approvedAt ?? input.createdAt;
  const timestamp =
    typeof timestampSource === 'string'
      ? timestampSource
      : timestampSource.toISOString();

  return {
    id: `action:${input.id}`,
    source: 'suggested_action',
    phase,
    title: actionTitle ? `${kindLabel}: ${actionTitle}` : kindLabel,
    description:
      input.rationale?.trim() ||
      (phase === 'pending'
        ? 'Jovie suggested an action that needs your approval.'
        : 'Jovie handled a suggested action.'),
    icon: 'approval',
    timestamp,
    statusLabel: phaseToStatusLabel(phase),
    href: APP_ROUTES.SETTINGS_CONNECTORS,
  };
}

export function mapRetouchJobToJovieWorkItem(input: {
  id: string;
  status: string;
  style: string;
  completedAt: Date | string | null;
  startedAt: Date | string | null;
  createdAt: Date | string;
}): JovieWorkItem {
  const phase = mapRetouchJobStatusToPhase(input.status);
  const timestampSource =
    input.completedAt ?? input.startedAt ?? input.createdAt;
  const timestamp =
    typeof timestampSource === 'string'
      ? timestampSource
      : timestampSource.toISOString();

  return {
    id: `retouch:${input.id}`,
    source: 'retouch_job',
    phase,
    title: 'Profile retouch',
    description: `Jovie retouched a photo with the ${humanizeSlug(input.style)} style.`,
    icon: 'retouch',
    timestamp,
    statusLabel: phaseToStatusLabel(phase),
    href: APP_ROUTES.SETTINGS_ARTIST_PROFILE,
  };
}

export function mapMerchFulfillmentJobToJovieWorkItem(input: {
  id: string;
  status: string;
  completedAt: Date | string | null;
  updatedAt: Date | string;
  createdAt: Date | string;
}): JovieWorkItem {
  const phase = mapMerchFulfillmentStatusToPhase(input.status);
  const timestampSource =
    input.completedAt ?? input.updatedAt ?? input.createdAt;
  const timestamp =
    typeof timestampSource === 'string'
      ? timestampSource
      : timestampSource.toISOString();

  return {
    id: `merch:${input.id}`,
    source: 'merch_fulfillment',
    phase,
    title: 'Merch fulfillment',
    description: 'Jovie submitted a merch order to Printful for fulfillment.',
    icon: 'merch',
    timestamp,
    statusLabel: phaseToStatusLabel(phase),
    href: APP_ROUTES.LIBRARY,
  };
}

export function mapMetadataSubmissionToJovieWorkItem(input: {
  id: string;
  status: string;
  providerId: string;
  releaseTitle: string | null;
  sentAt: Date | string | null;
  updatedAt: Date | string;
  createdAt: Date | string;
}): JovieWorkItem {
  const phase = mapMetadataSubmissionStatusToPhase(input.status);
  const timestampSource = input.sentAt ?? input.updatedAt ?? input.createdAt;
  const timestamp =
    typeof timestampSource === 'string'
      ? timestampSource
      : timestampSource.toISOString();

  const releaseLabel = input.releaseTitle?.trim() || 'a release';

  return {
    id: `metadata:${input.id}`,
    source: 'metadata_submission',
    phase,
    title: 'DSP metadata submission',
    description: `Jovie submitted metadata for ${releaseLabel} to ${humanizeSlug(input.providerId)}.`,
    icon: 'metadata',
    timestamp,
    statusLabel: phaseToStatusLabel(phase),
    href: APP_ROUTES.RELEASES,
  };
}

export function mapFanNotificationToJovieWorkItem(input: {
  id: string;
  status: string;
  notificationType: string;
  releaseTitle: string | null;
  sentAt: Date | string | null;
  scheduledFor: Date | string;
  createdAt: Date | string;
}): JovieWorkItem {
  const phase = mapFanNotificationStatusToPhase(input.status);
  const timestampSource = input.sentAt ?? input.scheduledFor ?? input.createdAt;
  const timestamp =
    typeof timestampSource === 'string'
      ? timestampSource
      : timestampSource.toISOString();

  const releaseLabel = input.releaseTitle?.trim() || 'a release';
  const notificationLabel =
    input.notificationType === 'release_day'
      ? 'release day fan email'
      : input.notificationType === 'preview'
        ? 'release preview fan email'
        : 'fan notification';

  return {
    id: `notification:${input.id}`,
    source: 'fan_notification',
    phase,
    title: 'Fan notification',
    description: `Jovie sent a ${notificationLabel} for ${releaseLabel}.`,
    icon: 'notification',
    timestamp,
    statusLabel: phaseToStatusLabel(phase),
    href: APP_ROUTES.AUDIENCE,
  };
}

export function mergeJovieWorkItems(
  items: readonly JovieWorkItem[],
  limit: number
): JovieWorkItem[] {
  return [...items]
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
    .slice(0, limit);
}

export function coerceJovieWorkItem(value: unknown): JovieWorkItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = value.id;
  const source = value.source;
  const phase = value.phase;
  const title = value.title;
  const description = value.description;
  const icon = value.icon;
  const timestamp = value.timestamp;
  const statusLabel = value.statusLabel;

  if (
    typeof id !== 'string' ||
    typeof title !== 'string' ||
    typeof description !== 'string' ||
    typeof timestamp !== 'string' ||
    typeof statusLabel !== 'string' ||
    !JOVIE_WORK_SOURCES.includes(source as JovieWorkSource) ||
    !JOVIE_WORK_PHASES.includes(phase as JovieWorkPhase) ||
    !JOVIE_WORK_ICONS.includes(icon as JovieWorkIcon)
  ) {
    return null;
  }

  const href = typeof value.href === 'string' ? value.href : undefined;

  return {
    id,
    source: source as JovieWorkSource,
    phase: phase as JovieWorkPhase,
    title,
    description,
    icon: icon as JovieWorkIcon,
    timestamp,
    statusLabel,
    href,
  };
}

export function parseJovieWorkFeedResponse(value: unknown): JovieWorkItem[] {
  if (!isRecord(value)) {
    return [];
  }

  const items = value.items;
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map(item => coerceJovieWorkItem(item))
    .filter((item): item is JovieWorkItem => item !== null);
}
