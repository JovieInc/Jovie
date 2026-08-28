export interface LibraryDownloadView {
  readonly id: string;
  readonly releaseId: string;
  readonly title: string;
  readonly fileName: string;
}

export interface LibraryPresenceFindingView {
  readonly id: string;
  readonly subjectType: 'artist' | 'release' | 'recording' | 'track';
  readonly subjectId: string;
  readonly kind: 'repair' | 'collision' | 'placement_opportunity';
  readonly issueType:
    | 'dead_link'
    | 'missing_jovie_link'
    | 'wrong_artist'
    | 'wrong_song'
    | 'wrong_identifier'
    | 'placement_opportunity';
  readonly platform: string;
  readonly title: string;
  readonly currentUrl: string | null;
  readonly expectedUrl: string | null;
  readonly actionMode: 'direct_update' | 'draft_request' | 'filter_only';
  readonly status: 'open' | 'drafted' | 'resolved' | 'dismissed';
  readonly collisionDisposition:
    | 'unreviewed'
    | 'not_this_artist'
    | 'not_this_song'
    | 'confirmed_match'
    | null;
  readonly draftRequest: string | null;
}

export interface LibraryRightsholderEvidenceView {
  readonly id: string;
  readonly subjectType: 'release' | 'recording' | 'track';
  readonly subjectId: string;
  readonly partyName: string;
  readonly role: string;
  readonly domain: 'composition' | 'master' | 'unknown';
  readonly evidenceClass: 'attested' | 'observed' | 'claimed';
  readonly source:
    | 'artist_attestation'
    | 'songview'
    | 'mlc'
    | 'catalog'
    | 'other';
  readonly shareBps: number | null;
}

export interface LibraryPostReleaseBundle {
  readonly downloads: readonly LibraryDownloadView[];
  readonly findings: readonly LibraryPresenceFindingView[];
  readonly rightsholders: readonly LibraryRightsholderEvidenceView[];
}
