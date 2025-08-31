'use client';

import { AnimatePresence, motion } from 'framer-motion';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import React, { useState } from 'react';
import { CTAButton } from '@/components/atoms/CTAButton';
import { ArtistPageShell } from '@/components/profile/ArtistPageShell';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { Artist, LegacySocialLink } from '@/types/db';

// Lazily load heavy profile sub-components to keep initial bundle lean
const AnimatedListenInterface = dynamic(
  () =>
    import('@/components/profile/AnimatedListenInterface').then(mod => ({
      default: mod.AnimatedListenInterface,
    })),
  { ssr: false }
);

const VenmoTipSelector = dynamic(
  () => import('@/components/profile/VenmoTipSelector'),
  { ssr: false }
);

interface AnimatedArtistPageProps {
  mode: string;
  artist: Artist;
  socialLinks: LegacySocialLink[];
  subtitle: string;
  showTipButton: boolean;
  showBackButton: boolean;
}

function renderContent(
  mode: string,
  artist: Artist,
  socialLinks: LegacySocialLink[],
  router: ReturnType<typeof useRouter>,
  isNavigating: boolean,
  prefersReducedMotion: boolean,
  setIsNavigating: (value: boolean) => void
) {
  switch (mode) {
    case 'listen':
      return (
        <div className='flex justify-center'>
          <AnimatedListenInterface artist={artist} handle={artist.handle} />
        </div>
      );

    case 'tip':
      // Extract Venmo link from social links
      const venmoLink =
        socialLinks.find(l => l.platform === 'venmo')?.url || null;
      const extractVenmoUsername = (url: string | null): string | null => {
        if (!url) return null;
        try {
          const u = new URL(url);
          const allowedVenmoHosts = ['venmo.com', 'www.venmo.com'];
          if (allowedVenmoHosts.includes(u.hostname)) {
            const parts = u.pathname.split('/').filter(Boolean);
            if (parts[0] === 'u' && parts[1]) return parts[1];
            if (parts[0]) return parts[0];
          }
          return null;
        } catch {
          return null;
        }
      };

      const venmoUsername = extractVenmoUsername(venmoLink);
      const AMOUNTS = [3, 5, 7];

      return (
        <motion.div
          initial={
            prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }
          }
          animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
          transition={
            prefersReducedMotion ? { duration: 0 } : { duration: 0.6 }
          }
        >
          <div
            className='space-y-4'
            role='main'
            aria-labelledby='tipping-title'
          >
            <h1 id='tipping-title' className='sr-only'>
              Tip {artist.name}
            </h1>

            {venmoLink ? (
              <VenmoTipSelector
                venmoLink={venmoLink}
                venmoUsername={venmoUsername ?? undefined}
                amounts={AMOUNTS}
                className='w-full max-w-sm'
              />
            ) : (
              <div className='text-center'>
                <div className='bg-white/60 dark:bg-white/5 backdrop-blur-lg border border-gray-200/30 dark:border-white/10 rounded-2xl p-8 shadow-xl shadow-black/5'>
                  <p className='text-gray-600 dark:text-gray-400' role='alert'>
                    Venmo tipping is not available for this artist yet.
                  </p>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      );

    default: // 'profile' mode
      return (
        <motion.div
          initial={
            prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }
          }
          animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
          transition={
            prefersReducedMotion ? { duration: 0 } : { duration: 0.6 }
          }
        >
          <div className='space-y-4'>
            <CTAButton
              href={`/${artist.handle}?mode=listen`}
              variant='primary'
              size='lg'
              className='w-full'
              isLoading={isNavigating}
              onClick={() => setIsNavigating(true)}
            >
              Listen Now
            </CTAButton>
          </div>
        </motion.div>
      );
  }
}

export function AnimatedArtistPage({
  mode,
  artist,
  socialLinks,
  subtitle,
  showTipButton,
  showBackButton,
}: AnimatedArtistPageProps) {
  const router = useRouter();
  const [isNavigating, setIsNavigating] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  // Page-level animation variants with Apple-style easing
  const pageVariants = {
    initial: {
      opacity: 0,
      scale: 0.98,
      y: 10,
      filter: 'blur(4px)',
    },
    animate: {
      opacity: 1,
      scale: 1,
      y: 0,
      filter: 'blur(0px)',
      transition: {
        duration: 0.5,
        ease: [0.16, 1, 0.3, 1], // Apple's signature easing curve
        staggerChildren: 0.1,
      },
    },
    exit: {
      opacity: 0,
      scale: 1.02,
      y: -10,
      filter: 'blur(2px)',
      transition: {
        duration: 0.3,
        ease: [0.4, 0, 1, 1],
      },
    },
  };

  return (
    <div className='w-full'>
      <ArtistPageShell
        artist={artist}
        socialLinks={socialLinks}
        subtitle={subtitle}
        showTipButton={showTipButton}
        showBackButton={showBackButton}
      >
        {/* Content pane with AnimatePresence for mode transitions */}
        <div
          className='content-pane'
          style={{
            contain: 'layout paint',
            willChange: 'transform',
            minHeight: '150px', // Reserve space for content to prevent layout shifts
          }}
        >
          <AnimatePresence mode='wait'>
            <motion.div
              key={mode} // Keep key only on the content that should change
              variants={prefersReducedMotion ? {} : pageVariants}
              initial={prefersReducedMotion ? { opacity: 1 } : 'initial'}
              animate={prefersReducedMotion ? { opacity: 1 } : 'animate'}
              exit={prefersReducedMotion ? { opacity: 0 } : 'exit'}
              className='w-full'
            >
              {renderContent(
                mode,
                artist,
                socialLinks,
                router,
                isNavigating,
                prefersReducedMotion,
                setIsNavigating
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </ArtistPageShell>
    </div>
  );
}
