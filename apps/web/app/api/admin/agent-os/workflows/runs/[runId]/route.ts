import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getRun } from 'workflow/api';
import { WorkflowRunNotFoundError } from 'workflow/errors';
import {
  type AgentRunArtifact,
  safeParseAgentRunArtifact,
} from '@/lib/agent-os/artifact';
import { areAgentOsWorkflowsEnabled } from '@/lib/agent-os/workflows';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

type RunRouteContext = {
  readonly params: Promise<{ readonly runId: string }>;
};

async function authorizeAdmin() {
  const entitlements = await getCurrentUserEntitlements();

  if (!entitlements.isAuthenticated) {
    return { ok: false as const, status: 401, error: 'Unauthorized' };
  }

  if (!entitlements.isAdmin) {
    return { ok: false as const, status: 403, error: 'Forbidden' };
  }

  return { ok: true as const };
}

function serializeDate(value: Date | undefined): string | null {
  return value ? value.toISOString() : null;
}

async function getCompletedArtifact(
  status: string,
  loadReturnValue: () => Promise<unknown>
): Promise<AgentRunArtifact | null> {
  if (status !== 'completed') {
    return null;
  }

  const parsed = safeParseAgentRunArtifact(await loadReturnValue());
  return parsed.success ? parsed.data : null;
}

export async function GET(_request: NextRequest, { params }: RunRouteContext) {
  const admin = await authorizeAdmin();

  if (!admin.ok) {
    return NextResponse.json(
      { error: admin.error },
      { status: admin.status, headers: NO_STORE_HEADERS }
    );
  }

  if (!areAgentOsWorkflowsEnabled()) {
    return NextResponse.json(
      { error: 'AgentOS workflows are disabled' },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }

  const { runId } = await params;
  const run = getRun<AgentRunArtifact>(runId);

  try {
    const [status, workflowName, createdAt, startedAt, completedAt] =
      await Promise.all([
        run.status,
        run.workflowName,
        run.createdAt,
        run.startedAt,
        run.completedAt,
      ]);
    const artifact = await getCompletedArtifact(status, () => run.returnValue);

    return NextResponse.json(
      {
        ok: true,
        runId,
        status,
        workflowName,
        createdAt: serializeDate(createdAt),
        startedAt: serializeDate(startedAt),
        completedAt: serializeDate(completedAt),
        artifact,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    if (WorkflowRunNotFoundError.is(error)) {
      return NextResponse.json(
        { error: `Workflow run ${runId} was not found` },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    console.error('[agentOsDryRun] Failed to load workflow run status', error);

    return NextResponse.json(
      { error: 'Failed to load workflow run status' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
