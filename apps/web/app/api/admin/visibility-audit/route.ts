import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/middleware';
import { assembleVisibilityAudit } from '@/lib/visibility-audit/assemble';
import { TIM_WHITE_VISIBILITY_AUDIT_INPUT } from '@/lib/visibility-audit/fixtures/tim-white';
import { renderVisibilityAuditMarkdown } from '@/lib/visibility-audit/render-markdown';
import { parseVisibilityAuditInput } from '@/lib/visibility-audit/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function markdownResponse(markdown: string): Response {
  return new Response(markdown, {
    status: 200,
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'cache-control': 'private, no-store',
    },
  });
}

/**
 * GET /api/admin/visibility-audit
 * Admin-only Tim White sample. `?format=markdown` returns the shareable
 * markdown; otherwise JSON.
 */
export async function GET(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;

  const report = assembleVisibilityAudit(TIM_WHITE_VISIBILITY_AUDIT_INPUT);
  const markdown = renderVisibilityAuditMarkdown(report);
  const format = new URL(request.url).searchParams.get('format');
  if (format === 'markdown') return markdownResponse(markdown);
  return NextResponse.json(
    { report, markdown },
    { headers: { 'cache-control': 'private, no-store' } }
  );
}

/**
 * POST /api/admin/visibility-audit
 * Assemble one artist report from an already-collected snapshot.
 * Does not call MusicFetch, SerpAPI, or ingestion fetchers.
 */
export async function POST(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = parseVisibilityAuditInput(raw);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const report = assembleVisibilityAudit(parsed.input);
  const markdown = renderVisibilityAuditMarkdown(report);
  const format = new URL(request.url).searchParams.get('format');
  if (format === 'markdown') return markdownResponse(markdown);
  return NextResponse.json(
    { report, markdown },
    { headers: { 'cache-control': 'private, no-store' } }
  );
}
