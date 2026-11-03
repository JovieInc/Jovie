import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  ReferenceConflict,
  referenceView,
} from '@/lib/agent-os/design-reference-corpus/adaptive/engine';
import {
  ReferenceIntakeSchema,
  ReferenceScopeSchema,
} from '@/lib/agent-os/design-reference-corpus/adaptive/types';
import { getFreshAuth } from '@/lib/auth/cached';
import { parseJsonBody } from '@/lib/http/parse-json';
import { requireOvieApiAccess } from '@/lib/ovie/privacy-lock/access';
import { ingestReferenceCapture } from '@/lib/ovie/reference-review/intake';
import { referenceRepository } from '@/lib/ovie/reference-review/store.server';

const headers = { 'Cache-Control': 'private, no-store' };
const schema = ReferenceScopeSchema.pick({ contextId: true, branchId: true })
  .extend({
    revision: z.number().int().nonnegative(),
    candidate: ReferenceIntakeSchema,
    base64: z
      .string()
      .min(1)
      .max(2_800_000)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/u),
  })
  .strict();
/** One explicitly uploaded capture, never automatic remote collection. */
export async function POST(request: Request) {
  const denied = await requireOvieApiAccess();
  if (denied) return denied;
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return NextResponse.json(
      { error: 'Origin is not allowed.' },
      { status: 403, headers }
    );
  const raw = await parseJsonBody(request, {
    route: '/api/admin/reference-review/intake',
    headers,
    maxBodySize: 3_000_000,
    redactParseErrors: true,
  });
  if (!raw.ok) return raw.response;
  const body = schema.safeParse(raw.data);
  if (!body.success)
    return NextResponse.json(
      { error: 'Invalid captured reference.' },
      { status: 400, headers }
    );
  try {
    const auth = await getFreshAuth();
    const actor = auth.actorUserId ?? auth.userId;
    const scope = ReferenceScopeSchema.parse({
      tenantId: actor,
      actorId: actor,
      contextId: body.data.contextId,
      branchId: body.data.branchId,
    });
    const state = await ingestReferenceCapture({
      repository: referenceRepository,
      scope,
      candidate: body.data.candidate,
      bytes: Buffer.from(body.data.base64, 'base64'),
      revision: body.data.revision,
      now: new Date().toISOString(),
    });
    return NextResponse.json(referenceView(state, scope), { headers });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof ReferenceConflict
            ? 'References changed. Reload before importing.'
            : 'Capture could not be verified or saved.',
      },
      { status: error instanceof ReferenceConflict ? 409 : 400, headers }
    );
  }
}
