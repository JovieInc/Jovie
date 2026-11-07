import { canonicalJson, sha256 } from '@/lib/agent-distribution/hash';

/** One immutable payload and the exact deployed renderer that previews it. */
export interface ContentReviewIdentity {
  readonly versionId: string;
  readonly kind: string;
  readonly key: string;
  readonly schemaVersion: number;
  readonly payloadDigest: string;
  readonly renderRevision: string;
  readonly renderBuildId: string;
  readonly expectedLiveVersionId: string | null;
  readonly previewArm: string | null;
  readonly reviewDigest: string;
}

export function contentReviewIdentity(
  version: {
    readonly id: string;
    readonly kind: string;
    readonly key: string;
    readonly schemaVersion: number;
    readonly data: unknown;
  },
  renderer: { readonly commitSha?: string; readonly buildId?: string },
  expectedLiveVersionId: string | null,
  previewArm: string | null = null
): ContentReviewIdentity | null {
  const { commitSha: renderRevision, buildId: renderBuildId } = renderer;
  if (
    !renderRevision ||
    !/^[a-f0-9]{40}$/.test(renderRevision) ||
    !renderBuildId ||
    ['development', 'unknown'].includes(renderBuildId)
  )
    return null;
  const binding = {
    versionId: version.id,
    kind: version.kind,
    key: version.key,
    schemaVersion: version.schemaVersion,
    payloadDigest: sha256(canonicalJson(version.data)),
    renderRevision,
    renderBuildId,
    expectedLiveVersionId,
    previewArm,
  };
  return {
    ...binding,
    reviewDigest: sha256(
      canonicalJson({ schema: 'content-record-review/v1', ...binding })
    ),
  };
}

export function contentApprovalProof(identity: ContentReviewIdentity): string {
  return canonicalJson({
    schema: 'content-record-approval/v1',
    identity,
    smoke: 'passed',
  });
}
