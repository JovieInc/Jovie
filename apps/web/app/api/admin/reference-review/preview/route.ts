import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  referenceEligibleIds,
  referenceScopeKey,
} from '@/lib/agent-os/design-reference-corpus/adaptive/engine';
import { readReferenceSession } from '@/lib/agent-os/design-reference-corpus/adaptive/repository';
import { ReferenceScopeSchema } from '@/lib/agent-os/design-reference-corpus/adaptive/types';
import { getFreshAuth } from '@/lib/auth/cached';
import { requireOvieApiAccess } from '@/lib/ovie/privacy-lock/access';
import {
  MAX_REFERENCE_IMAGE_BYTES,
  referencePreviewKey,
} from '@/lib/ovie/reference-review/intake';
import { referenceRepository } from '@/lib/ovie/reference-review/store.server';

const headers = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
};
export async function GET(request: Request) {
  const denied = await requireOvieApiAccess();
  if (denied) return denied;
  try {
    const auth = await getFreshAuth();
    const actor = auth.actorUserId ?? auth.userId;
    const url = new URL(request.url);
    const scope = ReferenceScopeSchema.parse({
      tenantId: actor,
      actorId: actor,
      contextId: url.searchParams.get('contextId'),
      branchId: url.searchParams.get('branchId'),
    });
    const state = await readReferenceSession(referenceRepository, scope);
    const id = url.searchParams.get('referenceId') ?? '';
    const media = state.media[id];
    // Both review and highly-rated boards can display only eligible material.
    if (
      !media ||
      media.previewSlot === null ||
      !referenceEligibleIds(state, scope).includes(id)
    )
      return NextResponse.json(
        { error: 'Preview unavailable.' },
        { status: 404, headers }
      );
    const preview = await referenceRepository.readPreview(
      referencePreviewKey(scope, media.previewSlot)
    );
    if (
      !preview ||
      preview.scopeKey !== referenceScopeKey(scope) ||
      preview.sha256 !== media.sha256
    )
      return NextResponse.json(
        { error: 'Preview unavailable.' },
        { status: 404, headers }
      );
    const bytes = Buffer.from(preview.base64, 'base64');
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(
        preview.contentType
      ) ||
      bytes.length > MAX_REFERENCE_IMAGE_BYTES ||
      createHash('sha256').update(bytes).digest('hex') !== media.sha256
    )
      throw new Error('Invalid preview bytes.');
    return new Response(bytes, {
      headers: {
        ...headers,
        'Content-Type': preview.contentType,
        'Content-Length': String(bytes.length),
      },
    });
  } catch {
    return NextResponse.json(
      { error: 'Preview unavailable.' },
      { status: 503, headers }
    );
  }
}
