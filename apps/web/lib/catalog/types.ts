export interface CatalogProviderIdentity {
  readonly provider: string;
  readonly providerId: string;
  readonly confidence?: number;
}

export interface CatalogCollaborator {
  readonly id: string;
  readonly name: string;
  readonly aliases?: readonly string[];
  readonly providerIds?: readonly CatalogProviderIdentity[];
}

export interface CatalogRelease {
  readonly id: string;
  readonly title: string;
  readonly slug: string;
  readonly artistNames: readonly string[];
  readonly releaseDate?: string;
}

export interface CatalogSnapshot {
  readonly ownerArtistName: string;
  readonly collaborators: readonly CatalogCollaborator[];
  readonly releases: readonly CatalogRelease[];
}

export interface CollaboratorSignalInput {
  readonly text: string;
  readonly provider?: string;
  readonly providerId?: string;
}

export type CollaboratorMatchMethod =
  | 'provider_id'
  | 'alias_exact'
  | 'name_exact'
  | 'alias_fuzzy';

export interface CollaboratorResolverResult {
  readonly collaborator: CatalogCollaborator;
  readonly confidence: number;
  readonly matchMethod: CollaboratorMatchMethod;
}

export interface CollaboratorCatalogMatch {
  readonly collaborator: CatalogCollaborator;
  readonly release: CatalogRelease;
  readonly confidence: number;
  readonly reason: string;
}

export interface CollaboratorSignalMatchResult {
  readonly resolver: CollaboratorResolverResult;
  readonly matches: readonly CollaboratorCatalogMatch[];
}
