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

export type SameOriginRequestFailureKind =
  | 'aborted-image'
  | 'failed-request'
  | 'ignored';

export function classifySameOriginRequestFailure(input: {
  readonly errorText: string | undefined;
  readonly resourceType: string;
  readonly sameOrigin: boolean;
}): SameOriginRequestFailureKind {
  if (!input.sameOrigin) return 'ignored';
  if (isDiagnosticAbortedImageRequest(input)) return 'aborted-image';
  return 'failed-request';
}

export function formatRequestFailure(
  url: string,
  errorText: string | undefined
): string {
  return `${url} ${errorText ?? 'unknown failure'}`;
}
