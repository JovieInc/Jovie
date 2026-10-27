import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  ReferenceConflict,
  referenceView,
} from '@/lib/agent-os/design-reference-corpus/adaptive/engine';
import {
  commitReferenceCommand,
  readReferenceSession,
} from '@/lib/agent-os/design-reference-corpus/adaptive/repository';
import {
  ReferenceCommandSchema,
  ReferenceScopeSchema,
} from '@/lib/agent-os/design-reference-corpus/adaptive/types';
import { getFreshAuth } from '@/lib/auth/cached';
import { captureError } from '@/lib/error-tracking';
import { parseJsonBody } from '@/lib/http/parse-json';
import { requireOvieApiAccess } from '@/lib/ovie/privacy-lock/access';
import {
  DesignContextQuerySchema,
  referenceDesignContext,
} from '@/lib/ovie/reference-review/design-context';
import { referenceRepository } from '@/lib/ovie/reference-review/store.server';

const headers = { 'Cache-Control': 'private, no-store' } as const;
const selectionSchema = ReferenceScopeSchema.pick({
  contextId: true,
  branchId: true,
});
const mutationSchema = selectionSchema
  .extend({ command: ReferenceCommandSchema })
  .strict();
function json(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers });
}
async function scopeFor(selection: z.infer<typeof selectionSchema>) {
  const auth = await getFreshAuth();
  // Actor-owned Ovie data: never accept an impersonated/customer tenant in the payload.
  const actor = auth.actorUserId ?? auth.userId;
  if (!actor) throw new ReferenceConflict('Session expired.');
  return ReferenceScopeSchema.parse({
    tenantId: actor,
    actorId: actor,
    ...selection,
  });
}
export async function GET(request: Request) {
  const denied = await requireOvieApiAccess();
  if (denied) return denied;
  const url = new URL(request.url);
  const selection = selectionSchema.safeParse({
    contextId: url.searchParams.get('contextId'),
    branchId: url.searchParams.get('branchId'),
  });
  if (!selection.success)
    return json({ error: 'Choose a context and branch.' }, 400);
  const designQuery =
    url.searchParams.get('format') === 'design-context'
      ? DesignContextQuerySchema.safeParse({
          surface: url.searchParams.get('surface'),
          terms: (url.searchParams.get('terms') ?? '')
            .split(',')
            .filter(Boolean),
          limit: Number(url.searchParams.get('limit') ?? 5),
        })
      : null;
  if (designQuery && !designQuery.success)
    return json({ error: 'Choose a valid reference surface and limit.' }, 400);
  try {
    const scope = await scopeFor(selection.data);
    const state = await readReferenceSession(referenceRepository, scope);
    return json(
      designQuery?.success
        ? referenceDesignContext(state, scope, designQuery.data)
        : referenceView(state, scope)
    );
  } catch (error) {
    await captureError('Reference review read failed', error);
    return json({ error: 'References could not load. Retry.' }, 503);
  }
}
export async function POST(request: Request) {
  const denied = await requireOvieApiAccess();
  if (denied) return denied;
  // Same-origin browser mutation; the privacy gate remains independently required.
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return json({ error: 'Origin is not allowed.' }, 403);
  const parsed = await parseJsonBody(request, {
    route: '/api/admin/reference-review',
    headers,
    maxBodySize: 8192,
    redactParseErrors: true,
  });
  if (!parsed.ok) return parsed.response;
  const body = mutationSchema.safeParse(parsed.data);
  if (!body.success) return json({ error: 'Invalid review action.' }, 400);
  try {
    const scope = await scopeFor({
      contextId: body.data.contextId,
      branchId: body.data.branchId,
    });
    return json(
      referenceView(
        await commitReferenceCommand(
          referenceRepository,
          scope,
          body.data.command
        ),
        scope
      )
    );
  } catch (error) {
    if (error instanceof ReferenceConflict)
      return json({ error: error.message }, 409);
    await captureError('Reference review save failed', error);
    return json(
      { error: 'Your action could not be saved. Retry or reload.' },
      503
    );
  }
}
