import 'server-only';

import { readFile } from 'node:fs/promises';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveVisualQaRunRelativePath } from '@/lib/agent-os/visual-qa/paths';
import { getVisualQaReviewRun } from '@/lib/agent-os/visual-qa/review';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureError } from '@/lib/error-tracking';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

const ParamsSchema = z.object({
  runId: z.string().trim().min(1).max(80),
  surfaceId: z.string().trim().min(1).max(80),
  kind: z.enum(['baseline', 'after', 'overlay']),
});

function stripRunPrefix(runId: string, relativePath: string): string {
  return relativePath.startsWith(`${runId}/`)
    ? relativePath.slice(runId.length + 1)
    : relativePath;
}

function imagePathForKind(
  kind: 'baseline' | 'after' | 'overlay',
  surface: {
    readonly baselinePath: string;
    readonly afterPath: string;
    readonly overlayPath: string | null;
  }
): string | null {
  if (kind === 'baseline') return surface.baselinePath;
  if (kind === 'after') return surface.afterPath;
  return surface.overlayPath;
}

export async function GET(
  _request: NextRequest,
  context: {
    params: Promise<{ runId: string; surfaceId: string; kind: string }>;
  }
): Promise<Response> {
  const entitlements = await getCurrentUserEntitlements();
  if (!entitlements.isAuthenticated) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }
  if (!entitlements.isAdmin) {
    return NextResponse.json(
      { error: 'Forbidden' },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  const parsedParams = ParamsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return NextResponse.json(
      { error: 'Invalid Visual QA image request' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const { runId, surfaceId, kind } = parsedParams.data;

  try {
    const run = await getVisualQaReviewRun(runId);
    const surface = run?.surfaces.find(
      candidate => candidate.surfaceId === surfaceId
    );

    if (!surface) {
      return NextResponse.json(
        { error: 'Visual QA surface not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const relativePath = imagePathForKind(kind, surface);

    if (!relativePath) {
      return NextResponse.json(
        { error: 'Visual QA image not available' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const filePath = resolveVisualQaRunRelativePath(
      runId,
      stripRunPrefix(runId, relativePath)
    );
    const buffer = await readFile(filePath);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': String(buffer.length),
        'Cache-Control': 'private, max-age=3600, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    await captureError('Failed to read Visual QA image', error, {
      route: '/api/admin/hud/visual-qa/[runId]/[surfaceId]/[kind]',
      runId,
      surfaceId,
      kind,
    });
    return NextResponse.json(
      { error: 'Visual QA image not found' },
      { status: 404, headers: NO_STORE_HEADERS }
    );
  }
}
