import {
  collaboratorAliasSimilarity,
  normalizeCollaboratorAlias,
} from './normalize';
import type {
  CatalogCollaborator,
  CatalogSnapshot,
  CollaboratorMatchMethod,
  CollaboratorResolverResult,
  CollaboratorSignalInput,
} from './types';

const PROVIDER_ID_CONFIDENCE = 0.98;
const ALIAS_EXACT_CONFIDENCE = 0.92;
const NAME_EXACT_CONFIDENCE = 0.9;
const ALIAS_FUZZY_BASE_CONFIDENCE = 0.75;
const ALIAS_FUZZY_MAX_CONFIDENCE = 0.88;
const MIN_FUZZY_SIMILARITY = 0.75;

interface CandidateScore {
  readonly collaborator: CatalogCollaborator;
  readonly confidence: number;
  readonly matchMethod: CollaboratorMatchMethod;
}

function getCollaboratorLabels(collaborator: CatalogCollaborator): string[] {
  return [collaborator.name, ...(collaborator.aliases ?? [])];
}

function scoreProviderIdMatch(
  collaborator: CatalogCollaborator,
  signal: CollaboratorSignalInput
): CandidateScore | null {
  if (!signal.provider || !signal.providerId) {
    return null;
  }

  const normalizedProvider = signal.provider.trim().toLowerCase();
  const normalizedProviderId = signal.providerId.trim().toLowerCase();

  const identity = collaborator.providerIds?.find(
    row =>
      row.provider.trim().toLowerCase() === normalizedProvider &&
      row.providerId.trim().toLowerCase() === normalizedProviderId
  );

  if (!identity) {
    return null;
  }

  return {
    collaborator,
    confidence: identity.confidence ?? PROVIDER_ID_CONFIDENCE,
    matchMethod: 'provider_id',
  };
}

function scoreAliasExactMatch(
  collaborator: CatalogCollaborator,
  signal: CollaboratorSignalInput
): CandidateScore | null {
  const normalizedSignal = normalizeCollaboratorAlias(signal.text);
  if (!normalizedSignal) {
    return null;
  }

  const exactAlias = getCollaboratorLabels(collaborator).find(
    label => normalizeCollaboratorAlias(label) === normalizedSignal
  );

  if (!exactAlias) {
    return null;
  }

  return {
    collaborator,
    confidence: ALIAS_EXACT_CONFIDENCE,
    matchMethod: 'alias_exact',
  };
}

function scoreNameExactMatch(
  collaborator: CatalogCollaborator,
  signal: CollaboratorSignalInput
): CandidateScore | null {
  const normalizedSignal = normalizeCollaboratorAlias(signal.text);
  const normalizedName = normalizeCollaboratorAlias(collaborator.name);

  if (!normalizedSignal || normalizedSignal !== normalizedName) {
    return null;
  }

  return {
    collaborator,
    confidence: NAME_EXACT_CONFIDENCE,
    matchMethod: 'name_exact',
  };
}

function scoreAliasFuzzyMatch(
  collaborator: CatalogCollaborator,
  signal: CollaboratorSignalInput
): CandidateScore | null {
  const labels = getCollaboratorLabels(collaborator);
  let bestSimilarity = 0;

  for (const label of labels) {
    const similarity = collaboratorAliasSimilarity(signal.text, label);
    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
    }
  }

  if (bestSimilarity < MIN_FUZZY_SIMILARITY) {
    return null;
  }

  const confidence =
    ALIAS_FUZZY_BASE_CONFIDENCE +
    bestSimilarity * (ALIAS_FUZZY_MAX_CONFIDENCE - ALIAS_FUZZY_BASE_CONFIDENCE);

  return {
    collaborator,
    confidence: Number(confidence.toFixed(4)),
    matchMethod: 'alias_fuzzy',
  };
}

function scoreContainedNameMatch(
  collaborator: CatalogCollaborator,
  signal: CollaboratorSignalInput
): CandidateScore | null {
  const normalizedSignal = normalizeCollaboratorAlias(signal.text);
  if (!normalizedSignal) {
    return null;
  }

  const containedLabel = getCollaboratorLabels(collaborator).find(label => {
    const normalizedLabel = normalizeCollaboratorAlias(label);
    return (
      normalizedLabel.length > 0 && normalizedSignal.includes(normalizedLabel)
    );
  });

  if (!containedLabel) {
    return null;
  }

  const similarity = collaboratorAliasSimilarity(signal.text, containedLabel);
  const confidence = Math.max(
    ALIAS_FUZZY_MAX_CONFIDENCE,
    ALIAS_FUZZY_BASE_CONFIDENCE +
      similarity * (ALIAS_FUZZY_MAX_CONFIDENCE - ALIAS_FUZZY_BASE_CONFIDENCE)
  );

  return {
    collaborator,
    confidence: Number(confidence.toFixed(4)),
    matchMethod: 'alias_fuzzy',
  };
}

function pickBestCandidate(
  candidates: readonly CandidateScore[]
): CollaboratorResolverResult | null {
  if (candidates.length === 0) {
    return null;
  }

  const methodPriority: Record<CollaboratorMatchMethod, number> = {
    provider_id: 4,
    alias_exact: 3,
    name_exact: 2,
    alias_fuzzy: 1,
  };

  const best = [...candidates].sort((left, right) => {
    const methodDelta =
      methodPriority[right.matchMethod] - methodPriority[left.matchMethod];
    if (methodDelta !== 0) {
      return methodDelta;
    }
    return right.confidence - left.confidence;
  })[0];

  if (!best) {
    return null;
  }

  return {
    collaborator: best.collaborator,
    confidence: best.confidence,
    matchMethod: best.matchMethod,
  };
}

export function resolveCatalogCollaborator(
  catalog: CatalogSnapshot,
  signal: CollaboratorSignalInput
): CollaboratorResolverResult | null {
  const trimmedSignal = signal.text.trim();
  if (!trimmedSignal && !signal.providerId) {
    return null;
  }

  const candidates = catalog.collaborators.flatMap(collaborator => {
    const scored = [
      scoreProviderIdMatch(collaborator, signal),
      scoreAliasExactMatch(collaborator, signal),
      scoreNameExactMatch(collaborator, signal),
      scoreContainedNameMatch(collaborator, signal),
      scoreAliasFuzzyMatch(collaborator, signal),
    ].filter((row): row is CandidateScore => row !== null);

    return scored;
  });

  return pickBestCandidate(candidates);
}
