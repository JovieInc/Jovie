export {
  matchCollaboratorCatalogReleases,
  matchCollaboratorSignal,
} from './collaborator-matcher';
export { resolveCatalogCollaborator } from './collaborator-resolver';
export {
  catalogCollaboratorFixtureScope,
  cosmicGateFixtureSignal,
  founderDemoCatalogSnapshot,
  theDeepEndFixtureReleaseId,
} from './fixtures';
export {
  collaboratorAliasSimilarity,
  normalizeCollaboratorAlias,
  tokenizeCollaboratorAlias,
} from './normalize';
export type {
  CatalogCollaborator,
  CatalogProviderIdentity,
  CatalogRelease,
  CatalogSnapshot,
  CollaboratorCatalogMatch,
  CollaboratorMatchMethod,
  CollaboratorResolverResult,
  CollaboratorSignalInput,
  CollaboratorSignalMatchResult,
} from './types';
