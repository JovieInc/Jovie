export const NON_CIRCULAR_IDENTITY_AVATAR_FIXTURE_TEST_ID =
  'non-circular-identity-avatar-fixture';

/** Deliberate-red square identity crop. Production person avatars must not match. */
export function NonCircularIdentityAvatarFixture() {
  return (
    <span
      data-testid={NON_CIRCULAR_IDENTITY_AVATAR_FIXTURE_TEST_ID}
      data-deliberate-red=''
      data-shape='person'
      className='inline-flex size-6 rounded-md bg-surface-2'
      style={{ outline: '2px solid #ff0000' }}
    />
  );
}
