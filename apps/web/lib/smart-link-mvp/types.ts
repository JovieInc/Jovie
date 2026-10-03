import type { LinkCandidate, LinkProvider, LinkResult } from './contract';

export interface StoredLink {
  readonly code: string;
  readonly query: string;
  readonly kind: 'track' | 'artist';
  readonly title: string | null;
  readonly artistName: string | null;
  readonly artworkUrl: string | null;
  readonly providers: readonly LinkProvider[];
  readonly isrc: string | null;
  readonly upc: string | null;
  readonly providerKey: string | null;
  readonly createdByUserId: string | null;
}

export interface CanonicalRelease {
  readonly pageUrl: string;
  readonly title: string | null;
  readonly artist: string | null;
  readonly artworkUrl: string | null;
}

export interface NewStoredLink extends StoredLink {
  readonly anonymousSubjectHash: string | null;
  readonly createdAt: Date;
  readonly anonymousMonth: Date | null;
}

export interface SmartLinkStore {
  findByIsrc(isrc: string): Promise<StoredLink | null>;
  findByProviderKey(providerKey: string): Promise<StoredLink | null>;
  findCanonical(input: {
    readonly isrc?: string | null;
    readonly providerKey?: string | null;
  }): Promise<CanonicalRelease | null>;
  /** Diagnostic after a conflict; this read never grants permission to insert. */
  countAnonymousInMonth(subjectHash: string, month: Date): Promise<number>;
  /**
   * Atomically admit at most three rows per anonymous subject/UTC month while
   * enforcing code/recording uniqueness. A conflict writes nothing; actual
   * storage failures throw. Bind the month to createdAt, never to a later clock.
   */
  insertWithQuota(row: NewStoredLink): Promise<StoredLink | 'conflict'>;
}

export interface ResolvedRelease {
  readonly title: string | null;
  readonly artist: string | null;
  readonly artworkUrl: string | null;
  readonly isrc: string | null;
  readonly upc: string | null;
  readonly providerKey: string | null;
  readonly providers: readonly LinkProvider[];
}

export type ResolveFailureCode =
  | 'NOT_FOUND'
  | 'UNSUPPORTED_INPUT'
  | 'BUDGET_EXHAUSTED'
  | 'UPSTREAM_FAILURE';

export type ResolveResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly code: ResolveFailureCode;
      readonly retryable: boolean;
    };

export interface SmartLinkResolver {
  resolveTrackUrl(url: string): Promise<ResolveResult<ResolvedRelease>>;
  resolveIsrc(isrc: string): Promise<ResolveResult<ResolvedRelease>>;
  searchTracks(query: string): Promise<ResolveResult<readonly LinkCandidate[]>>;
  resolveArtist(query: string): Promise<
    ResolveResult<
      | { readonly status: 'resolved'; readonly release: ResolvedRelease }
      | {
          readonly status: 'choices';
          readonly candidates: readonly LinkCandidate[];
        }
    >
  >;
}

export interface LinkActor {
  readonly userId: string | null;
  readonly anonymousSubjectHash: string | null;
}

export interface CreateLinkInput {
  readonly query: string;
  readonly kind?: 'track' | 'artist';
  readonly origin: string;
  readonly actor: LinkActor;
  readonly store: SmartLinkStore;
  readonly resolver: SmartLinkResolver;
  readonly now?: Date;
  readonly allocateCode?: () => string;
}

export type { LinkResult };
