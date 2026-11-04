import { createHash } from 'node:crypto';
import sharp from 'sharp';
import {
  importReferenceCandidates,
  ReferenceConflict,
  referenceScopeKey,
} from '@/lib/agent-os/design-reference-corpus/adaptive/engine';
import {
  commitReferenceIntake,
  type ReferenceRepository,
  readReferenceSession,
} from '@/lib/agent-os/design-reference-corpus/adaptive/repository';
import {
  REFERENCE_LIMITS,
  ReferenceIntakeSchema,
  type ReferenceScope,
} from '@/lib/agent-os/design-reference-corpus/adaptive/types';

export const MAX_REFERENCE_IMAGE_BYTES = 2 * 1024 * 1024;
export interface PrivateReferencePreview {
  readonly schema: 'jovie.reference-preview/v1';
  readonly scopeKey: string;
  readonly sha256: string;
  readonly contentType: 'image/jpeg' | 'image/png' | 'image/webp';
  readonly base64: string;
}
export interface ReferencePreviewRepository {
  readPreview(key: string): Promise<PrivateReferencePreview | null>;
  insertPreview(key: string, value: PrivateReferencePreview): Promise<boolean>;
}
function matchesPreview(
  saved: PrivateReferencePreview | null,
  verified: PrivateReferencePreview
) {
  return (
    saved?.schema === verified.schema &&
    saved.scopeKey === verified.scopeKey &&
    saved.sha256 === verified.sha256 &&
    saved.contentType === verified.contentType &&
    saved.base64 === verified.base64
  );
}
export function referencePreviewKey(scope: ReferenceScope, slot: number) {
  if (
    !Number.isInteger(slot) ||
    slot < 0 ||
    slot >= REFERENCE_LIMITS.references
  )
    throw new Error('Invalid preview slot.');
  return `${referenceScopeKey(scope)}:image:${slot}`;
}
export function referencePreviewPath(scope: ReferenceScope, id: string) {
  return `/api/admin/reference-review/preview?${new URLSearchParams({ contextId: scope.contextId, branchId: scope.branchId, referenceId: id })}`;
}
/** Manual, authorized capture intake: no remote fetch, model call or image
 * modification. Validate readable bytes and digest before private persistence.
 * Automated discovery must supply its own source/rights verification first. */
export async function ingestReferenceCapture(input: {
  readonly repository: ReferenceRepository & ReferencePreviewRepository;
  readonly scope: ReferenceScope;
  readonly candidate: unknown;
  readonly bytes: Uint8Array;
  readonly revision: number;
  readonly now: string;
}) {
  const candidate = ReferenceIntakeSchema.parse(input.candidate);
  const current = await readReferenceSession(input.repository, input.scope);
  const existing = current.media[candidate.reference.id];
  // An exact capture retry can reconcile a lost successful response. Identity
  // and all media fields are still checked by importReferenceCandidates below.
  if (current.revision !== input.revision && !existing)
    throw new ReferenceConflict('Reference intake revision changed.');
  const slot =
    current.media[candidate.reference.id]?.previewSlot ??
    Object.keys(current.media).length;
  const normalized = {
    ...candidate,
    media: {
      ...candidate.media,
      previewUrl: referencePreviewPath(input.scope, candidate.reference.id),
      previewSlot: slot,
    },
  };
  // Enforce corpus and ID limits before persisting image bytes.
  const planned = importReferenceCandidates(
    current,
    input.scope,
    [normalized],
    input.now
  );
  if (!Object.hasOwn(planned.media, candidate.reference.id)) return current;
  if (!input.bytes.length || input.bytes.length > MAX_REFERENCE_IMAGE_BYTES)
    throw new Error('Reference image exceeds the 2 MiB limit.');
  const sha256 = createHash('sha256').update(input.bytes).digest('hex');
  if (sha256 !== candidate.media.sha256)
    throw new Error('Reference image digest mismatch.');
  const metadata = await sharp(input.bytes, {
    limitInputPixels: 40_000_000,
  }).metadata();
  // Decode the complete image too; a readable header can mask truncated data.
  await sharp(input.bytes, { limitInputPixels: 40_000_000 }).stats();
  if (
    !['jpeg', 'png', 'webp'].includes(metadata.format ?? '') ||
    (metadata.pages && metadata.pages > 1) ||
    metadata.width !== candidate.media.width ||
    metadata.height !== candidate.media.height
  )
    throw new Error('Reference image metadata mismatch or unsupported format.');
  const preview: PrivateReferencePreview = {
    schema: 'jovie.reference-preview/v1',
    scopeKey: referenceScopeKey(input.scope),
    sha256,
    contentType:
      metadata.format === 'jpeg'
        ? 'image/jpeg'
        : metadata.format === 'png'
          ? 'image/png'
          : 'image/webp',
    base64: Buffer.from(input.bytes).toString('base64'),
  };
  if (existing) {
    if (
      !matchesPreview(
        await input.repository.readPreview(
          referencePreviewKey(input.scope, slot)
        ),
        preview
      )
    )
      throw new ReferenceConflict(
        'Preview slot needs reconciliation before another intake.'
      );
    return current;
  }
  // Immutable bytes first. An interrupted intake may leave a bounded private
  // orphan, but never a session pointing to missing bytes or a public image.
  const inserted = await input.repository.insertPreview(
    referencePreviewKey(input.scope, slot),
    preview
  );
  if (!inserted) {
    const previous = await input.repository.readPreview(
      referencePreviewKey(input.scope, slot)
    );
    if (!matchesPreview(previous, preview))
      throw new ReferenceConflict(
        'Preview slot needs reconciliation before another intake.'
      );
  }
  return commitReferenceIntake(
    input.repository,
    input.scope,
    [normalized],
    input.revision,
    input.now
  );
}
