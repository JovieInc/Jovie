import { ExternalLink } from 'lucide-react';
import type { AgentRunArtifact } from '@/lib/agent-os/artifact';
import { VerificationGateList } from './VerificationGateList';
import { WorkflowStatusPill } from './WorkflowStatusPill';

const HUMAN_GATE_LABELS: Record<
  AgentRunArtifact['humanGate']['status'],
  string
> = {
  not_required: 'Not Required',
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

function formatCost(artifact: AgentRunArtifact): string {
  if (!artifact.costEstimate) return 'Not estimated';
  if (artifact.costEstimate.usd === 0) return '$0.00';
  return artifact.costEstimate.usd.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 4,
  });
}

const AGENT_OS_LINK_ALLOWED_HOSTS = new Set(['github.com', 'linear.app']);

function getPullRequestLabel(url: string | null): string {
  if (!url) return 'Pull Request';
  try {
    const lastSegment = new URL(url).pathname.split('/').filter(Boolean).pop();
    const num = lastSegment ? Number.parseInt(lastSegment, 10) : null;
    return num !== null && !Number.isNaN(num) ? `#${num}` : 'Pull Request';
  } catch {
    return 'Pull Request';
  }
}

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

function ArtifactLink({
  href,
  label,
}: Readonly<{ readonly href: string | null; readonly label: string }>) {
  const safeHref = getSafeExternalHref(href);
  if (!safeHref) return null;

  return (
    <a
      href={safeHref}
      target='_blank'
      rel='noopener noreferrer'
      aria-label={`${label} (opens in a new tab)`}
      className='inline-flex items-center gap-1 text-[12px] font-[520] text-secondary-token hover:text-primary-token'
    >
      {label}
      <ExternalLink className='size-3' aria-hidden='true' />
    </a>
  );
}

interface ArtifactDrawerProps {
  readonly artifact: AgentRunArtifact | null;
}

export function ArtifactDrawer({ artifact }: ArtifactDrawerProps) {
  if (!artifact) {
    return (
      <aside className='border-subtle border-t pt-3'>
        <p className='mb-2 text-[12.5px] font-[560] text-primary-token'>
          Selected Run
        </p>
        <p className='text-[13px] text-secondary-token'>
          Select a run to inspect its gates.
        </p>
      </aside>
    );
  }

  return (
    <aside
      className='border-subtle border-t pt-3'
      data-testid='agent-os-artifact-drawer'
    >
      <p className='mb-3 text-[12.5px] font-[560] text-primary-token'>
        Selected Run
      </p>
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <p className='truncate text-[13px] font-[590] text-primary-token'>
            {artifact.title}
          </p>
          <p className='mt-1 text-[12px] leading-5 text-secondary-token'>
            {artifact.summary}
          </p>
        </div>
        <WorkflowStatusPill status={artifact.status} />
      </div>

      <dl className='mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-[12px]'>
        <div className='min-w-0'>
          <dt className='text-tertiary-token'>Source</dt>
          <dd className='mt-1 truncate font-[540] text-primary-token'>
            {artifact.source}
          </dd>
        </div>
        <div className='min-w-0'>
          <dt className='text-tertiary-token'>Route</dt>
          <dd className='mt-1 truncate font-[540] text-primary-token'>
            {artifact.modelRoute}
          </dd>
        </div>
        <div className='min-w-0'>
          <dt className='text-tertiary-token'>Cost</dt>
          <dd className='mt-1 truncate font-[540] text-primary-token'>
            {formatCost(artifact)}
          </dd>
        </div>
        <div className='min-w-0'>
          <dt className='text-tertiary-token'>Human Gate</dt>
          <dd className='mt-1 truncate font-[540] text-primary-token'>
            {HUMAN_GATE_LABELS[artifact.humanGate.status]}
          </dd>
        </div>
      </dl>

      {artifact.blockedReason ? (
        <div className='mt-4 rounded-lg border border-warning/20 bg-surface-1 px-3 py-2 text-[12px] leading-5 text-warning'>
          {artifact.blockedReason}
        </div>
      ) : null}

      <div className='mt-4 flex flex-wrap gap-3'>
        <ArtifactLink
          href={artifact.linearIssueUrl}
          label={artifact.linearIssueId ?? 'Linear'}
        />
        <ArtifactLink
          href={artifact.pullRequestUrl}
          label={getPullRequestLabel(artifact.pullRequestUrl)}
        />
      </div>

      <div className='mt-4'>
        <p className='mb-2 text-[12.5px] font-[560] text-primary-token'>
          Verification Gates
        </p>
        <VerificationGateList gates={artifact.verificationGates} />
      </div>
    </aside>
  );
}
