'use client';

import { AnimatePresence, motion } from 'framer-motion';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { ArtistPageShell } from '@/components/profile/ArtistPageShell';
import { ArtistNotificationsCTA } from '@/components/profile/artist-notifications-cta';
import { getContentMotionProps } from './motion-helpers';
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
  const _router = useRouter();
  const {
    isNavigating: _isNavigating,
    setIsNavigating: _setIsNavigating,
    prefersReducedMotion,
    tippingEnabled,
    pageVariants,
  } = useAnimatedArtistPage();

  const contentMotion = getContentMotionProps(prefersReducedMotion);

  const renderContent = () => {
    switch (mode) {
      case 'listen':
        return (
          <div className='flex justify-center'>
            <AnimatedListenInterface
              artist={artist}
              handle={artist.handle}
              enableDynamicEngagement={enableDynamicEngagement}
            />
          </div>
        );

      case 'tip':
        if (!tippingEnabled) {
          return (
            <motion.div {...contentMotion}>
              <div className='space-y-4 text-center'>
                <div className='bg-surface-0 backdrop-blur-lg border border-subtle rounded-2xl p-8 shadow-xl'>
                  <p className='text-secondary-token' role='alert'>
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
          <motion.div {...contentMotion}>
            <main className='space-y-4' aria-labelledby='tipping-title'>
              <h1 id='tipping-title' className='sr-only'>
                Tip {artist.name}
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
                  <div className='bg-surface-0 backdrop-blur-lg border border-subtle rounded-2xl p-8 shadow-xl'>
                    <p className='text-secondary-token' role='alert'>
                      Venmo tipping is not available for this artist yet.
                    </p>
                  </div>
                </div>
              )}
            </main>
          </motion.div>
        );

      default:
        return (
          <motion.div {...contentMotion}>
            <div className='space-y-4'>
              <ArtistNotificationsCTA artist={artist} variant='button' />
            </div>
          </motion.div>
        );
    }
  };

  return (
    <div className='w-full'>
      <ArtistPageShell
        artist={artist}
        socialLinks={socialLinks}
        contacts={contacts}
        subtitle={subtitle}
        showTipButton={showTipButton && tippingEnabled}
        showBackButton={showBackButton}
      >
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
              key={mode}
              variants={prefersReducedMotion ? undefined : pageVariants}
              initial={prefersReducedMotion ? { opacity: 1 } : 'initial'}
              animate={prefersReducedMotion ? { opacity: 1 } : 'animate'}
              exit={prefersReducedMotion ? { opacity: 0 } : 'exit'}
              className='w-full'
            >
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </div>
      </ArtistPageShell>
    </div>
  );
}
