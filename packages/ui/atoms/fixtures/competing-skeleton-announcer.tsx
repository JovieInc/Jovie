export const COMPETING_SKELETON_ANNOUNCER_FIXTURE_TEST_ID =
  'competing-skeleton-announcer-fixture';

/**
 * Deliberate-red nested live region. Production LoadingSkeleton owns the
 * announcement; decorative descendants must stay hidden.
 */
export function CompetingSkeletonAnnouncerFixture() {
  return (
    <div
      data-testid={COMPETING_SKELETON_ANNOUNCER_FIXTURE_TEST_ID}
      data-deliberate-red=''
      data-red-kind='competing-announcer'
      role='status'
      aria-busy='true'
      aria-live='polite'
      aria-label='Loading content'
      className='w-full space-y-2'
      style={{ outline: '2px solid #ff0000' }}
    >
      <div
        className='skeleton h-4 w-full rounded-sm'
        role='status'
        aria-busy='true'
        aria-live='polite'
      />
    </div>
  );
}
