export const UNRESERVED_SKELETON_FIXTURE_TEST_ID =
  'unreserved-skeleton-fixture';

/** Deliberate-red collapsing placeholder. Production skeletons must reserve height. */
export function UnreservedSkeletonFixture() {
  return (
    <div
      data-testid={UNRESERVED_SKELETON_FIXTURE_TEST_ID}
      data-deliberate-red=''
      data-red-kind='unreserved-geometry'
      className='skeleton w-full'
      style={{ outline: '2px solid #ff0000' }}
    />
  );
}
