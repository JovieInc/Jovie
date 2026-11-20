import type { DesignReference } from '../types';
import { createReferenceSession, importReferenceCandidates } from './engine';
import type {
  MediaAnchor,
  ReferenceAction,
  ReferenceScope,
  ReferenceSession,
} from './types';

export const scope: ReferenceScope = {
  tenantId: 'test-tenant',
  actorId: 'test-actor',
  contextId: 'editorial',
  branchId: 'main',
};
export const now = '2026-10-26T00:00:00.000Z';
export function candidate(index: number, patch: Partial<MediaAnchor> = {}) {
  const id = `ref-${String(index).padStart(3, '0')}`;
  const sha256 = index.toString(16).padStart(64, '0');
  const sourceUrl = `https://source.example/reference/${index}`;
  const reference: DesignReference = {
    id,
    source: {
      kind: 'live-page',
      title: `Reference ${index}`,
      url: sourceUrl,
      author: 'Source credit',
      publishedAt: null,
      capturedAt: now,
    },
    pageType: 'editorial',
    sections: [
      {
        id: 'image',
        designVariable: 'product-media',
        pageType: 'editorial',
        summary: 'Synthetic test reference',
        excerpt: null,
        mediaRef: id,
      },
    ],
    notes: null,
    ingestedAt: now,
  };
  const media: MediaAnchor = {
    sourceUrl,
    originalUrl: `https://media.example/${index}.jpg`,
    previewUrl: `https://media.example/${index}.jpg`,
    sha256,
    width: 100,
    height: 100,
    capturedAt: now,
    credit: 'Synthetic test fixture',
    kind: 'image',
    timecodeMs: null,
    generated: false,
    verification: 'verified',
    rights: {
      referenceOnly: true,
      previewAllowed: true,
      productionReuse: false,
      publicRedistribution: false,
      evidence: 'Synthetic test fixture',
    },
    classification: {
      category: index % 2 === 0 ? 'editorial' : 'product shots',
      substyles: ['test-style'],
      model: 'mock-classifier',
      version: 1,
      inputSha256: sha256,
    },
    clusterId: null,
    previewSlot: null,
    ...patch,
  };
  return { reference, media };
}
export function session(count = 51): ReferenceSession {
  return importReferenceCandidates(
    createReferenceSession(scope, now),
    scope,
    Array.from({ length: count }, (_, i) => candidate(i + 1)),
    now
  );
}
export function command(
  state: ReferenceSession,
  action: ReferenceAction,
  commandId = `cmd-${state.revision}`
) {
  return { commandId, revision: state.revision, action };
}
