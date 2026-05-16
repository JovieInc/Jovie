import { eq } from 'drizzle-orm';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { formatUsd } from '@/lib/admin/format';
import { db } from '@/lib/db';
import { agentRuns } from '@/lib/db/schema/connectors';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';

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
  const entitlements = await getCurrentUserEntitlements();

  if (
    !entitlements.isAuthenticated ||
    !entitlements.userId ||
    !entitlements.isAdmin
  ) {
    redirect(APP_ROUTES.DASHBOARD);
  }

  const { id } = await params;

  const [run] = await db
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.id, id))
    .limit(1);

  if (!run) {
    notFound();
  }

  const tokenUsage = run.tokenUsage as Record<string, number> | null;
  const toolCalls = (run.toolCalls as unknown[]) ?? [];
  // Use formatUsd for display; raw cost is stored with 4dp precision.
  const costDisplay = run.cost ? formatUsd(Number(run.cost)) : '—';

  return (
    <div className='mx-auto max-w-4xl space-y-6 p-6'>
      <div className='space-y-1'>
        <h1 className='text-xl font-semibold text-primary'>Agent Run Debug</h1>
        <p className='text-sm text-tertiary font-mono'>{run.id}</p>
      </div>

      {/* Run metadata */}
      <Section title='Run Metadata'>
        <MetaRow label='Agent' value={run.agentSlug} />
        <MetaRow label='Model' value={run.model ?? '—'} />
        <MetaRow label='Status' value={run.status} />
        <MetaRow label='Trigger' value={run.triggerKind} />
        <MetaRow label='Started' value={run.startedAt?.toISOString() ?? '—'} />
        <MetaRow
          label='Completed'
          value={run.completedAt?.toISOString() ?? '—'}
        />
        <MetaRow label='Cost' value={costDisplay} />
      </Section>

      {/* Token usage */}
      {tokenUsage && (
        <Section title='Token Usage'>
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
        </Section>
      )}

      {/* Input context digest */}
      <Section title='Input Context Digest'>
        <code className='block break-all rounded bg-surface-0 p-3 text-xs font-mono text-secondary'>
          {run.inputContextDigest}
        </code>
        <p className='mt-1 text-xs text-tertiary'>
          SHA-256 of the input context. Raw context is never stored (PII
          protection).
        </p>
      </Section>

      {/* Rendered prompt */}
      {run.prompt && (
        <Section title='Rendered Prompt'>
          <pre className='max-h-96 overflow-y-auto whitespace-pre-wrap rounded bg-surface-0 p-3 text-xs font-mono text-secondary'>
            {run.prompt}
          </pre>
        </Section>
      )}

      {/* Tool calls */}
      {toolCalls.length > 0 && (
        <Section title={`Tool Calls (${toolCalls.length})`}>
          <pre className='max-h-64 overflow-y-auto whitespace-pre-wrap rounded bg-surface-0 p-3 text-xs font-mono text-secondary'>
            {JSON.stringify(toolCalls, null, 2)}
          </pre>
        </Section>
      )}

      {/* Error */}
      {run.error && (
        <Section title='Error'>
          <pre className='whitespace-pre-wrap rounded bg-surface-0 p-3 text-xs font-mono text-destructive'>
            {run.error}
          </pre>
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section className='space-y-2'>
      <h2 className='text-sm font-medium text-secondary'>{title}</h2>
      <div className='rounded-lg border border-subtle bg-surface-1 p-4 space-y-2'>
        {children}
      </div>
    </section>
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
    <div className='flex items-baseline justify-between gap-4 text-sm'>
      <span className='text-tertiary shrink-0'>{label}</span>
      <span className='font-mono text-xs text-secondary truncate'>{value}</span>
    </div>
  );
}
