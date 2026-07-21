'use client';

import { Clock3, ExternalLink } from 'lucide-react';
import type { AgentRunArtifact } from '@/lib/agent-os/artifact';
import { cn } from '@/lib/utils';
import { WorkflowStatusPill } from './WorkflowStatusPill';

const HUMAN_GATE_LABELS: Record<
  AgentRunArtifact['humanGate']['status'],
  string
> = {
  not_required: 'Not Required',
  pending: 'Review Required',
  approved: 'Approved',
  rejected: 'Rejected',
};

function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  }).format(new Date(value));
}

const AGENT_OS_LINK_ALLOWED_HOSTS = new Set(['github.com', 'linear.app']);

function getSafeExternalHref(href: string | null): string | null {
  if (!href) return null;

  try {
    const url = new URL(href);
    if (url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
    if (!AGENT_OS_LINK_ALLOWED_HOSTS.has(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

interface RowActionLinkProps {
  readonly href: string | null;
  readonly label: string;
}

function RowActionLink({ href, label }: RowActionLinkProps) {
  const safeHref = getSafeExternalHref(href);
  if (!safeHref) return null;

  return (
    <a
      href={safeHref}
      target='_blank'
      rel='noopener noreferrer'
      aria-label={`${label} (opens in a new tab)`}
      onClick={e => e.stopPropagation()}
      className='inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs font-[520] text-tertiary-token transition-colors hover:bg-surface-0 hover:text-primary-token focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
    >
      {label}
      <ExternalLink className='size-3' aria-hidden='true' />
    </a>
  );
}

interface WorkflowRunRowProps {
  readonly artifact: AgentRunArtifact;
  readonly isSelected?: boolean;
  readonly onSelect?: (artifact: AgentRunArtifact) => void;
}

export function WorkflowRunRow({
  artifact,
  isSelected = false,
  onSelect,
}: WorkflowRunRowProps) {
  const containerClassName = cn(
    'grid w-full gap-2 rounded-lg border border-subtle bg-surface-1 px-3 py-2.5 text-left transition-colors',
    isSelected && 'border-(--linear-border-focus) bg-surface-0',
    onSelect && !isSelected && 'hover:bg-surface-0'
  );

  const hasPr = getSafeExternalHref(artifact.pullRequestUrl) !== null;
  const hasLinear = getSafeExternalHref(artifact.linearIssueUrl) !== null;
  const hasActions = hasPr || hasLinear;

  const mainContent = (
    <>
      <div className='flex min-w-0 items-start justify-between gap-3'>
        <div className='min-w-0'>
          <p className='truncate text-app font-[560] text-primary-token'>
            {artifact.title}
          </p>
          <p className='mt-1 line-clamp-2 text-2xs leading-4 text-tertiary-token'>
            {artifact.summary}
          </p>
        </div>
        <div className='grid shrink-0 justify-items-end gap-1'>
          <WorkflowStatusPill status={artifact.status} />
          {artifact.humanApprovalRequired ? (
            <span className='rounded-md border border-warning/20 bg-surface-0 px-1.5 py-0.5 text-3xs font-[520] text-warning'>
              {HUMAN_GATE_LABELS[artifact.humanGate.status]}
            </span>
          ) : null}
        </div>
      </div>
      <div className='flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-tertiary-token'>
        <span>{artifact.modelRoute}</span>
        <span>{artifact.source}</span>
        <span className='inline-flex items-center gap-1'>
          <Clock3 className='size-3' aria-hidden='true' />
          {formatUpdatedAt(artifact.updatedAt)}
        </span>
      </div>
    </>
  );

  if (!onSelect) {
    return (
      <div className={containerClassName}>
        {mainContent}
        {hasActions ? (
          <div className='flex items-center gap-1 border-t border-subtle pt-2'>
            <RowActionLink href={artifact.pullRequestUrl} label='Open PR' />
            <RowActionLink href={artifact.linearIssueUrl} label='Open Linear' />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={containerClassName}>
      <button
        type='button'
        onClick={() => onSelect(artifact)}
        className='grid gap-2 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-(--app-shell-content-surface)'
        aria-pressed={isSelected}
      >
        {mainContent}
      </button>
      {hasActions ? (
        <div className='flex items-center gap-1 border-t border-subtle pt-2'>
          <RowActionLink href={artifact.pullRequestUrl} label='Open PR' />
          <RowActionLink href={artifact.linearIssueUrl} label='Open Linear' />
        </div>
      ) : null}
    </div>
  );
}
