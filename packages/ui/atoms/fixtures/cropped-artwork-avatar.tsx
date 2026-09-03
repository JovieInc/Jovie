export const CROPPED_ARTWORK_AVATAR_FIXTURE_TEST_ID =
  'cropped-artwork-avatar-fixture';

/** Deliberate-red circular, cover-fit artwork crop. Production artwork must not match. */
export function CroppedArtworkAvatarFixture() {
  return (
    <span
      data-testid={CROPPED_ARTWORK_AVATAR_FIXTURE_TEST_ID}
      data-deliberate-red=''
      data-shape='artwork'
      className='inline-flex size-24 overflow-hidden rounded-full bg-surface-2'
    >
      <img
        data-testid={`${CROPPED_ARTWORK_AVATAR_FIXTURE_TEST_ID}-image`}
        alt=''
        className='h-full w-full rounded-full object-cover'
      />
    </span>
  );
}
