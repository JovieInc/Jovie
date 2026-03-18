import { checkGate, FEATURE_FLAG_KEYS } from '@/lib/feature-flags/server';
import type { FeaturedCreator } from '@/lib/featured-creators';
import {
  getCreatorByHandle,
  getFeaturedCreators,
} from '@/lib/featured-creators';
import { FALLBACK_AVATARS, fillToMinimum } from './featured-creators-fallback';
import { SeeItInActionCarousel } from './SeeItInActionCarousel';

const PINNED_HANDLE = 'tim';

const Separator = (
  <hr
    className='mx-auto max-w-lg border-0 h-px'
    style={{
      background:
        'linear-gradient(to right, transparent, var(--linear-separator-via), transparent)',
    }}
  />
);

/**
 * "See it in action" section gated by Statsig.
 * When the gate is off, the section is hidden entirely.
 * When on, always fetches real profiles: tim pinned first,
 * remaining slots from featured creators.
 */
export async function SeeItInActionSafe() {
  const showSection = await checkGate(
    null,
    FEATURE_FLAG_KEYS.SHOW_SEE_IT_IN_ACTION,
    false
  );

  if (!showSection) return null;

  try {
    const [timProfile, dbCreators] = await Promise.all([
      getCreatorByHandle(PINNED_HANDLE),
      getFeaturedCreators(),
    ]);

    const others = dbCreators.filter(c => c.handle !== PINNED_HANDLE);

    const pinned: FeaturedCreator[] = [];
    if (timProfile) pinned.push(timProfile);
    pinned.push(...others.slice(0, 3 - pinned.length));

    const creators = fillToMinimum(pinned, 3);
    return (
      <>
        {Separator}
        <SeeItInActionCarousel creators={creators} />
      </>
    );
  } catch (error) {
    console.error('[Homepage] SeeItInAction failed:', error);

    try {
      const Sentry = await import('@sentry/nextjs');
      Sentry.captureException(error, {
        tags: {
          context: 'homepage_see_it_in_action',
          critical: 'true',
        },
        extra: {
          message: 'Featured creators fetch failed, using fallback avatars',
        },
      });
    } catch (sentryError) {
      console.error('[Homepage] Failed to log to Sentry:', sentryError);
    }

    return (
      <>
        {Separator}
        <SeeItInActionCarousel creators={FALLBACK_AVATARS} />
      </>
    );
  }
}
