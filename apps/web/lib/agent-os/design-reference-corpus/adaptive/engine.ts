import { createHash } from 'node:crypto';
import { createDesignReferenceCorpus, ingestDesignReference } from '../corpus';
import {
  type MediaAnchor,
  MediaAnchorSchema,
  REFERENCE_BATCH_SIZE,
  REFERENCE_LIMITS,
  type ReferenceCard,
  type ReferenceCommand,
  ReferenceCommandSchema,
  ReferenceIntakeSchema,
  type ReferenceScope,
  ReferenceScopeSchema,
  type ReferenceSession,
  ReferenceSessionSchema,
  type ReferenceView,
} from './types';

export class ReferenceConflict extends Error {}
export function referenceScopeKey(scope: ReferenceScope): string {
  const s = ReferenceScopeSchema.parse(scope);
  return `design-refs:${createHash('sha256')
    .update(JSON.stringify([s.tenantId, s.actorId, s.contextId, s.branchId]))
    .digest('hex')}`;
}
function assertScope(state: ReferenceSession, scope: ReferenceScope) {
  if (referenceScopeKey(state.scope) !== referenceScopeKey(scope))
    throw new ReferenceConflict('Reference scope mismatch.');
}
export function createReferenceSession(
  scope: ReferenceScope,
  now: string
): ReferenceSession {
  return {
    schema: 'jovie.adaptive-references/v1',
    scope: ReferenceScopeSchema.parse(scope),
    revision: 0,
    corpus: createDesignReferenceCorpus(now),
    media: {},
    ratings: {},
    skipped: [],
    clusters: {},
    batch: { number: 0, ids: [] },
    undo: null,
    commands: {},
    feedback: [],
  };
}
/** Preserve semantic query parameters (including YouTube v); strip only known tracking. */
export function referenceUrlIdentity(value: string): string {
  const url = new URL(value);
  for (const key of [...url.searchParams.keys()]) {
    if (/^utm_/iu.test(key) || ['fbclid', 'gclid'].includes(key))
      url.searchParams.delete(key);
  }
  url.searchParams.sort();
  return url.toString();
}
function eligible(state: ReferenceSession, id: string): boolean {
  const anchor = state.media[id];
  const record = state.corpus.references[id];
  return Boolean(
    anchor &&
      record &&
      anchor.verification === 'verified' &&
      anchor.previewUrl &&
      anchor.rights.previewAllowed &&
      !['rejected', 'decertified'].includes(record.status)
  );
}
function category(anchor: MediaAnchor): string | null {
  const c = anchor.classification;
  return c && c.inputSha256 === anchor.sha256 ? c.category : null;
}
/** Full scoped eligibility for consumers; independent of UI batch/top limits. */
export function referenceEligibleIds(
  state: ReferenceSession,
  scope: ReferenceScope
): string[] {
  assertScope(state, scope);
  return Object.keys(state.media).filter(id => eligible(state, id));
}
export function referencePreferenceTerms(
  state: ReferenceSession,
  scope: ReferenceScope
): { preferred: string[]; avoided: string[] } {
  assertScope(state, scope);
  const scores = new Map<string, number>();
  for (const [id, rating] of Object.entries(state.ratings)) {
    if (!eligible(state, id)) continue;
    const anchor = state.media[id];
    const c = anchor.classification;
    const terms = [
      category(anchor),
      ...(c?.inputSha256 === anchor.sha256 ? c.substyles : []),
      anchor.clusterId ? state.clusters[anchor.clusterId] : null,
    ].filter((t): t is string => Boolean(t));
    for (const term of new Set(terms))
      scores.set(term, (scores.get(term) ?? 0) + rating - 3);
  }
  const sorted = [...scores].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  );
  return {
    preferred: sorted
      .filter(([, n]) => n > 0)
      .map(([t]) => t)
      .slice(0, 6),
    avoided: sorted
      .filter(([, n]) => n < 0)
      .map(([t]) => t)
      .slice(-6),
  };
}
function nextBatch(state: ReferenceSession): ReferenceSession['batch'] {
  const unseen = Object.keys(state.media)
    .filter(
      id =>
        eligible(state, id) &&
        state.ratings[id] === undefined &&
        !state.skipped.includes(id)
    )
    .sort();
  const preferred = new Set(
    referencePreferenceTerms(state, state.scope).preferred
  );
  const ranked = [...unseen].sort(
    (a, b) =>
      Number(preferred.has(category(state.media[b]) ?? '')) -
        Number(preferred.has(category(state.media[a]) ?? '')) ||
      a.localeCompare(b)
  );
  // One in five is exploration; favor a category not represented yet in this batch.
  const ids: string[] = [];
  const used = new Set<string>();
  while (ids.length < REFERENCE_BATCH_SIZE && ids.length < unseen.length) {
    const pool = ids.length % 5 === 4 ? unseen : ranked;
    const pick =
      (ids.length % 5 === 4
        ? pool.find(
            id =>
              !ids.includes(id) &&
              !used.has(category(state.media[id]) ?? 'unclassified')
          )
        : undefined) ?? pool.find(id => !ids.includes(id));
    if (!pick) break;
    ids.push(pick);
    used.add(category(state.media[pick]) ?? 'unclassified');
  }
  return { number: state.batch.number + 1, ids };
}
export function importReferenceCandidates(
  state: ReferenceSession,
  scope: ReferenceScope,
  inputs: readonly unknown[],
  now: string
): ReferenceSession {
  assertScope(state, scope);
  if (inputs.length > REFERENCE_LIMITS.intake)
    throw new Error('Reference intake limit reached.');
  const next = structuredClone(state);
  for (const raw of inputs) {
    const { reference, media } = ReferenceIntakeSchema.parse(raw);
    if (media.sourceUrl !== reference.source.url)
      throw new Error('Source identity mismatch.');
    if (
      media.clusterId !== null &&
      !Object.hasOwn(next.clusters, media.clusterId)
    )
      throw new Error('Unknown cluster.');
    if (next.corpus.references[reference.id]) {
      if (
        JSON.stringify(next.corpus.references[reference.id].reference) ===
          JSON.stringify(reference) &&
        JSON.stringify(next.media[reference.id]) === JSON.stringify(media)
      )
        continue;
      throw new ReferenceConflict('Reference ID already exists.');
    }
    const duplicate = Object.values(next.media).some(
      m =>
        m.sha256 === media.sha256 ||
        (referenceUrlIdentity(m.originalUrl) ===
          referenceUrlIdentity(media.originalUrl) &&
          m.timecodeMs === media.timecodeMs)
    );
    if (duplicate) continue;
    if (Object.keys(next.media).length >= REFERENCE_LIMITS.references)
      throw new Error('Reference intake limit reached.');
    next.corpus = ingestDesignReference(next.corpus, reference, now);
    next.media[reference.id] = media;
  }
  if (next.batch.ids.length === 0) next.batch = nextBatch(next);
  next.revision += 1;
  return ReferenceSessionSchema.parse(next);
}
function activeIds(state: ReferenceSession) {
  return state.batch.ids.filter(
    id =>
      eligible(state, id) &&
      state.ratings[id] === undefined &&
      !state.skipped.includes(id)
  );
}
export function applyReferenceCommand(
  state: ReferenceSession,
  scope: ReferenceScope,
  raw: ReferenceCommand
): ReferenceSession {
  assertScope(state, scope);
  const command = ReferenceCommandSchema.parse(raw);
  const signature = JSON.stringify(command);
  if (Object.hasOwn(state.commands, command.commandId)) {
    if (state.commands[command.commandId] !== signature)
      throw new ReferenceConflict('Command ID reused.');
    return state;
  }
  if (command.revision !== state.revision)
    throw new ReferenceConflict('References changed. Reload to continue.');
  if (
    Object.keys(state.commands).length >= REFERENCE_LIMITS.commands ||
    state.feedback.length >= REFERENCE_LIMITS.commands
  )
    throw new ReferenceConflict('Session command limit reached.');
  const next = structuredClone(state);
  const a = command.action;
  if (a.type === 'rate' || a.type === 'skip') {
    if (!activeIds(state).includes(a.referenceId))
      throw new ReferenceConflict(
        'Reference is no longer in the active batch.'
      );
    next.undo = {
      referenceId: a.referenceId,
      batch: structuredClone(state.batch),
      kind: a.type,
    };
    if (a.type === 'rate') next.ratings[a.referenceId] = a.rating;
    else next.skipped.push(a.referenceId);
    if (activeIds(next).length === 0) next.batch = nextBatch(next);
  } else if (a.type === 'undo') {
    if (!state.undo) throw new ReferenceConflict('Nothing to undo.');
    delete next.ratings[state.undo.referenceId];
    next.skipped = next.skipped.filter(id => id !== state.undo?.referenceId);
    next.batch = state.undo.batch;
    next.undo = null;
  } else if (a.type === 'create-cluster') {
    if (
      Object.hasOwn(next.clusters, a.clusterId) ||
      Object.keys(next.clusters).length >= REFERENCE_LIMITS.clusters
    )
      throw new ReferenceConflict('Cluster already exists or limit reached.');
    next.clusters[a.clusterId] = a.label;
  } else {
    if (
      !eligible(state, a.referenceId) ||
      (a.clusterId !== null && !Object.hasOwn(state.clusters, a.clusterId))
    )
      throw new ReferenceConflict('Unknown reference or cluster.');
    next.media[a.referenceId].clusterId = a.clusterId;
  }
  next.commands[command.commandId] = signature;
  next.revision += 1;
  next.feedback.push({
    commandId: command.commandId,
    action: command.action,
    revision: next.revision,
    recordedAt: new Date().toISOString(),
  });
  return next;
}

/** Fast-model results are proposals tied to exact pixels and model version.
 * A late classification cannot overwrite newer labels or human grouping. */
export function applyReferenceClassification(
  state: ReferenceSession,
  scope: ReferenceScope,
  referenceId: string,
  raw: unknown
): ReferenceSession {
  assertScope(state, scope);
  const media = state.media[referenceId];
  if (!media) throw new ReferenceConflict('Unknown reference.');
  const classification = MediaAnchorSchema.shape.classification
    .unwrap()
    .parse(raw);
  if (
    classification.inputSha256 !== media.sha256 ||
    classification.version <= (media.classification?.version ?? 0)
  )
    return state;
  const next = structuredClone(state);
  next.media[referenceId].classification = classification;
  next.revision += 1;
  return next;
}
/** Safe projection only: private keys, provenance internals and the command log stay server-side. */
export function referenceView(
  state: ReferenceSession,
  scope: ReferenceScope
): ReferenceView {
  assertScope(state, scope);
  const card = (id: string): ReferenceCard => ({
    id,
    title: state.corpus.references[id].reference.source.title,
    previewUrl: state.media[id].previewUrl ?? '',
    sourceUrl: state.media[id].sourceUrl,
    width: state.media[id].width,
    height: state.media[id].height,
    credit: state.media[id].credit,
    category: category(state.media[id]),
    clusterId: state.media[id].clusterId,
    rating: state.ratings[id] ?? null,
  });
  const all = Object.keys(state.media).filter(id => eligible(state, id));
  return {
    boards: Object.fromEntries(
      Object.keys(state.clusters).map(clusterId => [
        clusterId,
        all.filter(id => state.media[id].clusterId === clusterId).map(card),
      ])
    ),
    undoReferenceId: state.undo?.referenceId ?? null,
    revision: state.revision,
    batchNumber: state.batch.number,
    batchSize: state.batch.ids.length,
    items: activeIds(state).map(card),
    top: all
      .filter(id => (state.ratings[id] ?? 0) >= 4)
      .sort((a, b) => state.ratings[b] - state.ratings[a] || a.localeCompare(b))
      .slice(0, REFERENCE_BATCH_SIZE)
      .map(card),
    ratedCount: Object.keys(state.ratings).length,
    remaining: all.filter(
      id => state.ratings[id] === undefined && !state.skipped.includes(id)
    ).length,
    heldCount: Object.keys(state.media).length - all.length,
    canUndo: state.undo !== null,
    clusters: state.clusters,
  };
}
