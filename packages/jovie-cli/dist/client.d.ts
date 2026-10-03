export declare const DEFAULT_BASE_URL = "https://jov.ie";
export declare const DEFAULT_TIMEOUT_MS = 30000;
export declare const DEFAULT_USER_AGENT = "jovie-cli";
export type FetchImplementation = (input: string | URL, init?: RequestInit) => Promise<Response>;
export type ResourceOptions = {
    readonly baseUrl?: string;
    readonly fetchImpl?: FetchImplementation;
    readonly signal?: AbortSignal;
    readonly timeoutMs?: number;
    readonly userAgent?: string;
};
export declare class JovieInputError extends Error {
    readonly code: "INVALID_INPUT";
    constructor(message: string);
}
export declare class JovieRequestError extends Error {
    readonly url: string;
    readonly status?: number | undefined;
    readonly responseBody?: string | undefined;
    readonly retryAfterSeconds?: number | undefined;
    /** Stable server error code (e.g. RATE_LIMITED) when the API sent one. */
    readonly apiCode?: string | undefined;
    readonly code: "REQUEST_FAILED";
    constructor(message: string, url: string, status?: number | undefined, responseBody?: string | undefined, retryAfterSeconds?: number | undefined, 
    /** Stable server error code (e.g. RATE_LIMITED) when the API sent one. */
    apiCode?: string | undefined);
}
/** Normalize a deployment root without accepting credentials or query state. */
export declare function normalizeBaseUrl(baseUrl?: string): string;
export declare function validateUsername(username: string): string;
/** Fetch the public, unauthenticated artist API response. */
export declare function fetchArtist(username: string, options?: ResourceOptions): Promise<unknown>;
/** Fetch the canonical public OpenAPI 3.1 contract. */
export declare function fetchOpenApi(options?: ResourceOptions): Promise<unknown>;
/** Fetch the site-level machine-readable agent guide. */
export declare function fetchSiteLlms(full: boolean, options?: ResourceOptions): Promise<string>;
/** Fetch the machine-readable guide for one public artist. */
export declare function fetchArtistLlms(username: string, options?: ResourceOptions): Promise<string>;
/**
 * Create (or find) a Jovie profile for a Spotify artist. Returns the public
 * profile URL and, when unclaimed, a claim URL the human opens to verify
 * ownership. Anonymous and rate limited per IP.
 */
export declare function createProfile(spotifyArtistUrl: string, options?: ResourceOptions): Promise<unknown>;
export type ReportKind = 'bug' | 'feedback';
/** Safe execution context only; never env, credentials, or file contents. */
export interface ReportContext {
    readonly cliVersion?: string;
    readonly command?: string;
    readonly apiCode?: string;
    readonly scenario?: string;
    readonly platform?: string;
    readonly runtime?: string;
    readonly channel?: 'cli' | 'mcp';
}
/** File a bug or feedback report. Returns `{ reportId }`. */
export declare function reportIssue(report: {
    readonly kind: ReportKind;
    readonly title: string;
    readonly details: string;
}, context?: ReportContext, options?: ResourceOptions): Promise<unknown>;
//# sourceMappingURL=client.d.ts.map