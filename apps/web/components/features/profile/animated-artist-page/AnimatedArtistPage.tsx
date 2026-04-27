'use client';

import { AnimatePresence, motion } from 'motion/react';
import dynamic from 'next/dynamic';
import { PublicProfileTemplate } from '@/features/profile/templates/PublicProfileTemplate'; // NOSONAR -- AnimatedArtistPage is itself deprecated; both are legacy non-production components
import { buildProfilePublicViewModel } from '@/features/profile/view-models';
import {
  getFadeUpMotionProps,
  getPageWrapperMotionProps,
} from './motion-helpers';
import type { AnimatedArtistPageProps } from './types';
import { useAnimatedArtistPage } from './useAnimatedArtistPage';
import { extractVenmoUsername, findVenmoLink, PAY_AMOUNTS } from './utils';

const AnimatedListenInterface = dynamic(
  () =>
    import('@/features/profile/animated-listen-interface').then(mod => ({
      default: mod.AnimatedListenInterface,
    })),
  { ssr: false }
);

const VenmoPaySelector = dynamic(
  () => import('@/features/profile/VenmoPaySelector'),
  { ssr: false }
);

const ArtistNotificationsCTA = dynamic(
  () =>
    import('@/features/profile/artist-notifications-cta').then(mod => ({
      default: mod.ArtistNotificationsCTA,
    })),
  {
    ssr: false,
    loading: () => (
      <div className='space-y-4' aria-busy='true'>
        <div className='h-12 w-full rounded-xl bg-surface-1 animate-pulse' />
      </div>
    ),
  }
);

/**
 * @deprecated Legacy: not used by live routes. Production profile rendering
 * stays on StaticArtistPage -> ProfileCompactTemplate.
 */
export function AnimatedArtistPage({
  mode,
  artist,
  socialLinks,
  contacts,
  subtitle,
  showPayButton,
  showBackButton,
  enableDynamicEngagement = false,
}: AnimatedArtistPageProps) {
  const { prefersReducedMotion, tippingEnabled, pageVariants } =
    useAnimatedArtistPage();
  const viewModel = buildProfilePublicViewModel({
    mode,
    artist,
    socialLinks,
    contacts,
    subtitle,
    showPayButton: showPayButton && tippingEnabled,
    showBackButton,
    enableDynamicEngagement,
  });

  const renderContent = () => {
    const fadeUpProps = getFadeUpMotionProps(prefersReducedMotion);

    switch (viewModel.mode) {
      case 'listen':
        return (
          <div className='flex justify-center'>
            <AnimatedListenInterface
              artist={viewModel.artist}
              handle={viewModel.artist.handle}
              enableDynamicEngagement={viewModel.enableDynamicEngagement}
            />
          </div>
        );

      case 'pay': {
        if (!tippingEnabled) {
          return (
            <motion.div {...fadeUpProps}>
              <div className='space-y-4 text-center'>
                <div className='rounded-2xl border border-subtle bg-surface-1 p-6 shadow-sm'>
                  <p className='text-sm text-secondary-token' role='alert'>
                    Payments not available yet. We&apos;re focused on getting
                    the core Jovie profile experience right before launching
                    payments.
                  </p>
                </div>
              </div>
            </motion.div>
          );
        }

        const venmoLink = findVenmoLink(socialLinks);
        const venmoUsername = extractVenmoUsername(venmoLink);

        return (
          <motion.div {...fadeUpProps}>
            <main className='space-y-4' aria-labelledby='pay-title'>
              <h2 id='pay-title' className='sr-only'>
                Support {viewModel.artist.name}
              </h2>

              {venmoLink ? (
                <VenmoPaySelector
                  venmoLink={venmoLink}
                  venmoUsername={venmoUsername ?? undefined}
                  amounts={[...PAY_AMOUNTS]}
                  className='w-full max-w-sm'
                />
              ) : (
                <div className='text-center'>
                  <div className='rounded-2xl border border-subtle bg-surface-1 p-6 shadow-sm'>
                    <p className='text-sm text-secondary-token' role='alert'>
                      Venmo payments not available for this artist yet.
                    </p>
                  </div>
                </div>
              )}
            </main>
          </motion.div>
        );
      }

      default:
        return (
          <motion.div {...fadeUpProps}>
            <div className='space-y-4'>
              <ArtistNotificationsCTA
                artist={viewModel.artist}
                variant='button'
              />
            </div>
          </motion.div>
        );
    }
  };

  return (
    <PublicProfileTemplate viewModel={viewModel}>
      <div
        className='content-pane'
        style={{
          contain: 'layout paint',
          willChange: 'transform',
          minHeight: '150px',
        }}
      >
        <AnimatePresence mode='wait'>
          <motion.div
            key={viewModel.mode}
            {...getPageWrapperMotionProps(prefersReducedMotion, pageVariants)}
            className='w-full'
          >
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </div>
    </PublicProfileTemplate>
  );
}
