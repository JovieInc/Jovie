'use client';

import { AnimatePresence, motion } from 'motion/react';
import dynamic from 'next/dynamic';
import { PublicProfileTemplate } from '@/components/profile/templates/PublicProfileTemplate';
import { buildProfilePublicViewModel } from '@/components/profile/view-models';
import {
  getFadeUpMotionProps,
  getPageWrapperMotionProps,
} from './motion-helpers';
import type { AnimatedArtistPageProps } from './types';
import { useAnimatedArtistPage } from './useAnimatedArtistPage';
import { extractVenmoUsername, findVenmoLink, TIP_AMOUNTS } from './utils';

const AnimatedListenInterface = dynamic(
  () =>
    import('@/components/profile/animated-listen-interface').then(mod => ({
      default: mod.AnimatedListenInterface,
    })),
  { ssr: false }
);

const VenmoTipSelector = dynamic(
  () => import('@/components/profile/VenmoTipSelector'),
  { ssr: false }
);

const ArtistNotificationsCTA = dynamic(
  () =>
    import('@/components/profile/artist-notifications-cta').then(mod => ({
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

export function AnimatedArtistPage({
  mode,
  artist,
  socialLinks,
  contacts,
  subtitle,
  showTipButton,
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
    showTipButton: showTipButton && tippingEnabled,
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

      case 'tip': {
        if (!tippingEnabled) {
          return (
            <motion.div {...fadeUpProps}>
              <div className='space-y-4 text-center'>
                <div className='rounded-2xl border border-subtle bg-surface-1 p-6 shadow-sm'>
                  <p className='text-sm text-secondary-token' role='alert'>
                    Tipping is not available yet. We&apos;re focused on getting
                    the core Jovie profile experience right before launching
                    tipping.
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
            <main className='space-y-4' aria-labelledby='tipping-title'>
              <h1 id='tipping-title' className='sr-only'>
                Tip {viewModel.artist.name}
              </h1>

              {venmoLink ? (
                <VenmoTipSelector
                  venmoLink={venmoLink}
                  venmoUsername={venmoUsername ?? undefined}
                  amounts={[...TIP_AMOUNTS]}
                  className='w-full max-w-sm'
                />
              ) : (
                <div className='text-center'>
                  <div className='rounded-2xl border border-subtle bg-surface-1 p-6 shadow-sm'>
                    <p className='text-sm text-secondary-token' role='alert'>
                      Venmo tipping is not available for this artist yet.
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
