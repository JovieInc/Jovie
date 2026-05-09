import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { start } from 'workflow/api';
import { z } from 'zod';
import { areAgentOsWorkflowsEnabled } from '@/lib/agent-os/workflows';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import {
  AgentOsDryRunWorkflowInputSchema,
  agentOsDryRunWorkflow,
} from '@/workflows/agent-os-dry-run';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

function createDefaultSourceRunId() {
  return `agentos-dry-run-${crypto.randomUUID()}`;
}

async function authorizeAdmin() {
  const entitlements = await getCurrentUserEntitlements();

  if (!entitlements.isAuthenticated) {
    return { ok: false as const, status: 401, error: 'Unauthorized' };
  }

  if (!entitlements.isAdmin) {
    return { ok: false as const, status: 403, error: 'Forbidden' };
  }

  return {
    ok: true as const,
    requestedBy: entitlements.email ?? entitlements.userId ?? 'admin',
  };
}

async function readOptionalJson(request: NextRequest): Promise<unknown> {
  const body = await request.text();

  if (body.trim().length === 0) {
    return {};
  }

  return JSON.parse(body);
}

export async function POST(request: NextRequest) {
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

  try {
    const body = await readOptionalJson(request);
    const parsedInput = AgentOsDryRunWorkflowInputSchema.parse({
      ...(typeof body === 'object' && body !== null ? body : {}),
      requestedBy: admin.requestedBy,
    });
    const input = {
      ...parsedInput,
      sourceRunId: parsedInput.sourceRunId ?? createDefaultSourceRunId(),
    };
    const run = await start(agentOsDryRunWorkflow, [input]);

    return NextResponse.json(
      {
        ok: true,
        runId: run.runId,
        statusUrl: `/api/admin/agent-os/workflows/runs/${encodeURIComponent(run.runId)}`,
      },
      { status: 202, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Malformed JSON request body' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid AgentOS dry-run workflow request',
          issues: error.issues,
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    console.error('[agentOsDryRun] Failed to start workflow', error);

    return NextResponse.json(
      { error: 'Failed to start AgentOS dry-run workflow' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
