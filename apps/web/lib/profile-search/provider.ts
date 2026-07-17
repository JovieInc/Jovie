export interface ProfileSearchRequest {
  readonly query: string;
  readonly market: string;
  readonly locale: 'en';
  readonly device: 'desktop';
  readonly limit: 10;
}

export interface ProfileSearchOrganicResult {
  readonly position: number;
  readonly title: string;
  readonly snippet: string | null;
  readonly url: string;
  readonly normalizedUrl: string;
}

export interface ProfileSearchResponse {
  readonly provider: string;
  readonly fetchedAt: Date;
  readonly request: ProfileSearchRequest;
  readonly organicResults: readonly ProfileSearchOrganicResult[];
  readonly usage: Readonly<Record<string, unknown>>;
}

export interface ProfileSearchProvider {
  readonly id: string;
  search(request: ProfileSearchRequest): Promise<ProfileSearchResponse>;
}

export class ProfileSearchProviderError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'invalid_request'
      | 'invalid_response'
      | 'not_configured'
      | 'quota'
      | 'timeout'
      | 'upstream',
    readonly retryable: boolean
  ) {
    super(message);
    this.name = 'ProfileSearchProviderError';
  }
}
