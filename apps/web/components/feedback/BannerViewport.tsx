'use client';

import { useSyncExternalStore } from 'react';
import { Banner } from './Banner';
import { banner } from './banner-store';

const getServerSnapshot = () => null;

/**
 * Renders active banners from the canonical banner store, pinned to the
 * top of the viewport (safe-area aware). Mounted once by
 * `FeedbackProvider` — do not mount a second instance.
 */
export function BannerViewport() {
  const item = useSyncExternalStore(
    banner.subscribe,
    banner.getActiveBanner,
    getServerSnapshot
  );

  if (!item || (item.placement && item.placement !== 'viewport')) {
    return null;
  }

  return (
    <section
      aria-label='System Notifications'
      className='pointer-events-none fixed inset-x-0 top-0 z-50 flex flex-col gap-2 px-4 pb-2'
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)' }}
    >
      <div key={item.id} className='pointer-events-auto'>
        <Banner
          variant={item.variant}
          title={item.title}
          description={item.description}
          action={item.action}
          onDismiss={() => banner.dismiss(item.id)}
        />
      </div>
    </section>
  );
}
