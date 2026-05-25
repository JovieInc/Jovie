import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { APP_ROUTES } from '@/constants/routes';
import { formatUsd } from '@/lib/admin/format';
import { getCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { loadAdminAgentRun } from './agent-run-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: `Agent Run ${id.slice(0, 8)}` };
}

interface AgentRunDebugPageProps {
  readonly params: Promise<{ id: string }>;
}

/**
 * Admin-only debug page for a single agent run.
 * Shows: input context digest, rendered prompt, raw model output, parsed output,
 * tool calls, token usage, and cost.
 *
 * This is the prompt-iteration loop for the AI Connector concierge phase.
 * Gated by isAdmin — non-admins are redirected to dashboard.
 */
export default async function AgentRunDebugPage({
  params,
}: AgentRunDebugPageProps) {
  const adminAccess = await getCurrentAdminPageAccess();

  if (
    !adminAccess.isAuthenticated ||
    !adminAccess.userId ||
    !adminAccess.hasAdminRole
  ) {
    redirect(APP_ROUTES.DASHBOARD);
  }

  const { id } = await params;
  const run = await loadAdminAgentRun(id);

  if (!run) {
    notFound();
  }

  const tokenUsage = run.tokenUsage as Record<string, number> | null;
  const toolCalls = (run.toolCalls as unknown[]) ?? [];
  // Use formatUsd for display; raw cost is stored with 4dp precision.
  const costDisplay = run.cost ? formatUsd(Number(run.cost)) : '—';

  return (
    <AdminPage
      title='Agent Run Debug'
      description={run.id}
      testId='admin-agent-run-detail-page'
      className='max-w-(--app-shell-content-max-reading)'
    >
      {/* Run metadata */}
      <DebugSection title='Run Metadata'>
        <dl className='space-y-2'>
          <MetaRow label='Agent' value={run.agentSlug} />
          <MetaRow label='Model' value={run.model ?? '—'} />
          <MetaRow label='Status' value={run.status} />
          <MetaRow label='Trigger' value={run.triggerKind} />
          <MetaRow
            label='Started'
            value={run.startedAt?.toISOString() ?? '—'}
          />
          <MetaRow
            label='Completed'
            value={run.completedAt?.toISOString() ?? '—'}
          />
          <MetaRow label='Cost' value={costDisplay} />
        </dl>
      </DebugSection>

      {/* Token usage */}
      {tokenUsage && (
        <DebugSection title='Token Usage'>
          <dl className='space-y-2'>
            <MetaRow
              label='Prompt tokens'
              value={String(tokenUsage.promptTokens ?? '—')}
            />
            <MetaRow
              label='Completion tokens'
              value={String(tokenUsage.completionTokens ?? '—')}
            />
            <MetaRow
              label='Total tokens'
              value={String(tokenUsage.totalTokens ?? '—')}
            />
          </dl>
        </DebugSection>
      )}

      {/* Input context digest */}
      <DebugSection title='Input Context Digest'>
        <code className='block break-all rounded-md bg-surface-0 px-3 py-2.5 font-mono text-[12px] text-secondary-token'>
          {run.inputContextDigest}
        </code>
        <p className='mt-1 text-xs text-tertiary-token'>
          SHA-256 of the input context. Raw context is never stored (PII
          protection).
        </p>
      </DebugSection>

      {/* Rendered prompt */}
      {run.prompt && (
        <DebugSection title='Rendered Prompt'>
          <pre className='max-h-96 overflow-y-auto whitespace-pre-wrap rounded-md bg-surface-0 px-3 py-2.5 font-mono text-[12px] text-secondary-token'>
            {run.prompt}
          </pre>
        </DebugSection>
      )}

      {/* Tool calls */}
      {toolCalls.length > 0 && (
        <DebugSection title={`Tool Calls (${toolCalls.length})`}>
          <pre className='max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md bg-surface-0 px-3 py-2.5 font-mono text-[12px] text-secondary-token'>
            {JSON.stringify(toolCalls, null, 2)}
          </pre>
        </DebugSection>
      )}

      {/* Error */}
      {run.error && (
        <DebugSection title='Error'>
          <pre className='whitespace-pre-wrap rounded-md bg-surface-0 px-3 py-2.5 font-mono text-[12px] text-destructive'>
            {run.error}
          </pre>
        </DebugSection>
      )}
    </AdminPage>
  );
}

function DebugSection({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <ContentSurfaceCard
      as='section'
      surface='details'
      className='overflow-hidden p-0'
    >
      <ContentSectionHeader title={title} density='compact' />
      <div className='space-y-2 p-3.5'>{children}</div>
    </ContentSurfaceCard>
  );
}

function MetaRow({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className='grid gap-1 text-[13px] sm:grid-cols-[minmax(120px,0.4fr)_minmax(0,1fr)] sm:items-baseline'>
      <dt className='shrink-0 text-tertiary-token'>{label}</dt>
      <dd className='min-w-0 truncate font-mono text-[12px] text-secondary-token sm:text-right'>
        {value}
      </dd>
    </div>
  );
}
