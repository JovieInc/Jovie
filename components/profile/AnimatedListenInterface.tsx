'use client';

import {
  AnimatePresence,
  type MotionProps,
  motion,
  type Variants,
} from 'framer-motion';
import { useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import {
  AUDIENCE_SPOTIFY_PREFERRED_COOKIE,
  LISTEN_COOKIE,
} from '@/constants/app';
import { getDSPDeepLinkConfig, openDeepLink } from '@/lib/deep-links';
import { AvailableDSP, getAvailableDSPs } from '@/lib/dsp';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { Artist } from '@/types/db';

interface AnimatedListenInterfaceProps {
  artist: Artist;
  handle: string;
  enableDynamicEngagement?: boolean;
}

export function AnimatedListenInterface({
  artist,
  handle,
  enableDynamicEngagement = false,
}: AnimatedListenInterfaceProps) {
  const [dsps] = useState<AvailableDSP[]>(() => getAvailableDSPs(artist));
  const [selectedDSP, setSelectedDSP] = useState<string | null>(null);
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();

  const availableDSPs = dsps;

  // Handle backspace key to go back
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Backspace') {
        // Only trigger if not in an input field
        const target = event.target as HTMLElement;
        if (
          target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable)
        ) {
          return;
        }
        event.preventDefault();
        router.push(`/${handle}`);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handle, router]);

  const handleDSPClick = async (dsp: AvailableDSP) => {
    setSelectedDSP(dsp.key);

    try {
      // Save preference
      document.cookie = `${LISTEN_COOKIE}=${dsp.key}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;

      if (enableDynamicEngagement && dsp.key === 'spotify') {
        document.cookie = `${AUDIENCE_SPOTIFY_PREFERRED_COOKIE}=1; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
      }
      try {
        localStorage.setItem(LISTEN_COOKIE, dsp.key);
      } catch {}

      // Track click
      try {
        fetch('/api/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ handle, linkType: 'listen', target: dsp.key }),
          keepalive: true,
        }).catch(() => {});
      } catch {}

      // Try deep linking
      const deepLinkConfig = getDSPDeepLinkConfig(dsp.key);

      if (deepLinkConfig) {
        try {
          await openDeepLink(dsp.url, deepLinkConfig);
        } catch (error) {
          console.debug('Deep link failed, using fallback:', error);
          window.open(dsp.url, '_blank', 'noopener,noreferrer');
        }
      } else {
        window.open(dsp.url, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      console.error('Failed to handle DSP click:', error);
    } finally {
      // Reset selection after a delay
      setTimeout(() => setSelectedDSP(null), 1000);
    }
  };

  // Container animation variants
  const containerVariants: Variants = {
    hidden: {
      opacity: 0,
      scale: 0.95,
      y: 20,
    },
    visible: {
      opacity: 1,
      scale: 1,
      y: 0,
      transition: {
        duration: 0.6,
        ease: [0.16, 1, 0.3, 1], // Apple's easing curve
        staggerChildren: 0.1,
        delayChildren: 0.2,
      },
    },
    exit: {
      opacity: 0,
      scale: 0.95,
      y: -20,
      transition: {
        duration: 0.4,
        ease: [0.4, 0, 1, 1],
      },
    },
  };

  // Individual DSP button animation variants
  const itemVariants: Variants = {
    hidden: {
      opacity: 0,
      y: 30,
      scale: 0.9,
    },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        duration: 0.5,
        ease: [0.16, 1, 0.3, 1],
      },
    },
  };

  return (
    <AnimatePresence mode='wait'>
      <motion.div
        key='listen-interface'
        variants={prefersReducedMotion ? undefined : containerVariants}
        initial={prefersReducedMotion ? { opacity: 1 } : 'hidden'}
        animate={prefersReducedMotion ? { opacity: 1 } : 'visible'}
        exit={prefersReducedMotion ? { opacity: 0 } : 'exit'}
        className='w-full max-w-sm'
      >
        {/* DSP Buttons */}
        <motion.div
          variants={prefersReducedMotion ? undefined : itemVariants}
          className='space-y-3'
        >
          {availableDSPs.length === 0 ? (
            <div className='bg-surface-0 backdrop-blur-lg border border-subtle rounded-2xl p-8 shadow-xl text-center'>
              <p className='text-sm text-secondary-token'>
                Streaming links aren&apos;t available for this profile yet.
              </p>
            </div>
          ) : (
            availableDSPs.map(dsp => (
              <motion.button
                key={dsp.key}
                onClick={() => handleDSPClick(dsp)}
                disabled={selectedDSP === dsp.key}
                variants={prefersReducedMotion ? undefined : itemVariants}
                whileHover={
                  (prefersReducedMotion
                    ? undefined
                    : {
                        scale: 1.02,
                        y: -2,
                        transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] },
                      }) satisfies MotionProps['whileHover']
                }
                whileTap={
                  (prefersReducedMotion
                    ? undefined
                    : {
                        scale: 0.98,
                        transition: { duration: 0.1 },
                      }) satisfies MotionProps['whileTap']
                }
                className='w-full group relative overflow-hidden rounded-xl p-4 font-semibold text-base transition-all duration-300 ease-out shadow-lg hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-white/50 disabled:cursor-not-allowed'
                style={{
                  backgroundColor: dsp.config.color,
                  color: dsp.config.textColor,
                }}
                aria-label={`Open in ${dsp.name} app if installed, otherwise opens in web browser`}
              >
                {/* Shimmer effect overlay */}
                <motion.div
                  className='absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-white/20 to-transparent'
                  animate={
                    prefersReducedMotion
                      ? { opacity: selectedDSP === dsp.key ? 0.2 : 0 }
                      : { x: selectedDSP === dsp.key ? '200%' : '-100%' }
                  }
                  transition={
                    prefersReducedMotion
                      ? { duration: 0 }
                      : {
                          duration: 0.6,
                          ease: [0.16, 1, 0.3, 1],
                        }
                  }
                />

                {/* Button content */}
                <motion.span
                  className='relative flex items-center justify-center gap-3'
                  animate={{
                    scale: selectedDSP === dsp.key ? 1.05 : 1,
                  }}
                  transition={{ duration: 0.2 }}
                >
                  <motion.span
                    className='flex items-center'
                    dangerouslySetInnerHTML={{ __html: dsp.config.logoSvg }}
                    animate={
                      prefersReducedMotion
                        ? undefined
                        : { rotate: selectedDSP === dsp.key ? [0, 360] : 0 }
                    }
                    transition={
                      prefersReducedMotion
                        ? { duration: 0 }
                        : {
                            duration: 0.6,
                            ease: [0.16, 1, 0.3, 1],
                          }
                    }
                  />
                  <span>
                    {selectedDSP === dsp.key
                      ? 'Opening...'
                      : `Open in ${dsp.name}`}
                  </span>
                  {selectedDSP === dsp.key && (
                    <motion.div
                      initial={
                        prefersReducedMotion
                          ? { opacity: 1, scale: 1 }
                          : { opacity: 0, scale: 0 }
                      }
                      animate={
                        prefersReducedMotion
                          ? { opacity: 1, scale: 1 }
                          : { opacity: 1, scale: 1 }
                      }
                      className='w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin'
                    />
                  )}
                </motion.span>
              </motion.button>
            ))
          )}
        </motion.div>

        {/* Footer note */}
        <motion.p
          variants={prefersReducedMotion ? undefined : itemVariants}
          className='text-xs text-tertiary-token text-center mt-6'
        >
          Tap to open in the app or your browser
        </motion.p>
      </motion.div>
    </AnimatePresence>
  );
}
