// Authored preview — HomepageHeroCommandCenter. The homepage hero's product
// "command center" carousel. Image keys + scenarios mirror apps/web/app/(home)/
// page.tsx HERO_PRODUCT_IMAGES. Uses self-contained data-URI thumbnails
// (.design-sync/previews/_images.ts) so the panes render without network.
import { HomepageHeroCommandCenter } from 'apps/web/components';
import { IMG } from './_images';

const IMAGES = {
  library: IMG.library,
  profile: IMG.profilePay,
  release: IMG.release,
  releases: IMG.releases,
};

export function CommandCenter() {
  return <HomepageHeroCommandCenter images={IMAGES} />;
}
