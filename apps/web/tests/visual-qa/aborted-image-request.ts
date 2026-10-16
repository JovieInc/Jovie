const ABORTED_REQUEST_ERROR = 'net::ERR_ABORTED';

/**
 * Client-side image cancellation. Full-page screenshots resize the viewport
 * and Chromium aborts the superseded `srcset` candidate with this error.
 * DNS, connection, and reset failures stay on the request-failure gate.
 */
export function isDiagnosticAbortedImageRequest(input: {
  readonly errorText: string | undefined;
  readonly resourceType: string;
}): boolean {
  return (
    input.resourceType === 'image' && input.errorText === ABORTED_REQUEST_ERROR
  );
}

function headerValue(
  headers: Readonly<Record<string, string>> | undefined,
  name: string
): string | undefined {
  if (!headers) return undefined;
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) return value;
  }
  return undefined;
}

/**
 * Next.js App Router prefetch. Navigation cancels the in-flight flight
 * request (`?_rsc=` or the `RSC` / `text/x-component` headers). Only the
 * abort is expected; a refused or failed RSC request stays a real failure.
 */
export function isAbortedNextRscPrefetch(input: {
  readonly errorText: string | undefined;
  readonly url?: string;
  readonly headers?: Readonly<Record<string, string>>;
}): boolean {
  if (input.errorText !== ABORTED_REQUEST_ERROR) return false;
  if (input.url) {
    try {
      if (new URL(input.url).searchParams.has('_rsc')) return true;
    } catch {
      // A malformed URL is not an RSC prefetch.
    }
  }
  if (headerValue(input.headers, 'rsc') === '1') return true;
  return (
    headerValue(input.headers, 'accept')?.includes('text/x-component') ?? false
  );
}

const SAME_ORIGIN_CSS_CHUNK_PATH_PATTERN = /^\/_next\/static\/chunks\/.*\.css$/;

/**
 * Same-origin stylesheet-chunk cancellation. Navigating between public
 * screens cancels in-flight Next.js CSS chunks (resourceType `stylesheet`,
 * URL under `/_next/static/chunks/*.css`) with the abort signal. Only the
 * abort is diagnostic; a failed, refused, or non-chunk stylesheet load
 * stays a real failure.
 */
export function isAbortedSameOriginStylesheetChunk(input: {
  readonly errorText: string | undefined;
  readonly resourceType: string;
  readonly url?: string;
}): boolean {
  if (input.errorText !== ABORTED_REQUEST_ERROR) return false;
  if (input.resourceType === 'stylesheet') return true;
  if (input.url) {
    try {
      return SAME_ORIGIN_CSS_CHUNK_PATH_PATTERN.test(
        new URL(input.url).pathname
      );
    } catch {
      // A malformed URL is not a stylesheet chunk.
    }
  }
  return false;
}

export type SameOriginRequestFailureKind =
  | 'aborted-image'
  | 'failed-request'
  | 'ignored';

export function classifySameOriginRequestFailure(input: {
  readonly errorText: string | undefined;
  readonly resourceType: string;
  readonly sameOrigin: boolean;
  readonly url?: string;
  readonly headers?: Readonly<Record<string, string>>;
}): SameOriginRequestFailureKind {
  if (!input.sameOrigin) return 'ignored';
  if (isDiagnosticAbortedImageRequest(input)) return 'aborted-image';
  if (isAbortedNextRscPrefetch(input)) return 'ignored';
  if (isAbortedSameOriginStylesheetChunk(input)) return 'ignored';
  return 'failed-request';
}

export function formatRequestFailure(
  url: string,
  errorText: string | undefined
): string {
  return `${url} ${errorText ?? 'unknown failure'}`;
}
