// @coverage-via apps/web/tests/unit/home/homepage-anatomy-contract.test.tsx
import { HomepageIdentityClose } from './HomepageIdentityClose';
import { HomepageIdentitySections } from './HomepageIdentitySections';

/** Existing homepage body, shared by the route and its live component preview. */
export function HomepageIdentityStoryStack() {
  return (
    <div
      className='homepage-identity-stack'
      data-testid='homepage-identity-story-stack'
    >
      <HomepageIdentitySections />
      <HomepageIdentityClose />
    </div>
  );
}
