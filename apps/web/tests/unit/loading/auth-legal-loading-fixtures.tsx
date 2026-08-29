export const AUTH_LEGAL_LOADING_RED_FIXTURE_TEST_ID =
  'auth-legal-loading-red-fixture';

export const AUTH_LEGAL_LOADING_RED_STYLE = {
  outline: '2px solid #ff0000',
} as const;

/**
 * Deliberate-red: skeleton bars with no accessible loading owner.
 * Production AuthLoader / legal loading must not match this shape.
 */
export function MissingLoadingOwnerFixture() {
  return (
    <div
      data-testid={AUTH_LEGAL_LOADING_RED_FIXTURE_TEST_ID}
      data-deliberate-red=''
      data-red-kind='missing-owner'
      className='space-y-3'
      style={AUTH_LEGAL_LOADING_RED_STYLE}
    >
      <div className='h-10 w-56 skeleton rounded-md' />
      <div className='h-4 w-44 skeleton rounded-md' />
    </div>
  );
}

/**
 * Deliberate-red: two complete loading owners on one surface.
 * Production must keep exactly one owner.
 */
export function DuplicateLoadingOwnersFixture() {
  return (
    <div
      data-testid={AUTH_LEGAL_LOADING_RED_FIXTURE_TEST_ID}
      data-deliberate-red=''
      data-red-kind='duplicate-owners'
      className='space-y-4'
      style={AUTH_LEGAL_LOADING_RED_STYLE}
    >
      <div
        role='status'
        aria-busy='true'
        aria-live='polite'
        aria-label='Loading'
      >
        Loading
      </div>
      <div
        role='status'
        aria-busy='true'
        aria-live='polite'
        aria-label='Still Loading'
      >
        Still Loading
      </div>
    </div>
  );
}

/**
 * Deliberate-red: a named owner that still ships a raw local skeleton.
 * Production legal loading must compose the canonical Skeleton primitive.
 */
export function RawSkeletonLoadingFixture() {
  return (
    <div
      data-testid={AUTH_LEGAL_LOADING_RED_FIXTURE_TEST_ID}
      data-deliberate-red=''
      data-red-kind='raw-skeleton'
      className='space-y-3'
      role='status'
      aria-busy='true'
      aria-live='polite'
      aria-label='Loading Legal Document'
      style={AUTH_LEGAL_LOADING_RED_STYLE}
    >
      <div className='h-10 w-56 skeleton rounded-md' />
      <div className='h-4 w-full skeleton rounded-md' />
    </div>
  );
}
