'use client';

import { AnimatePresence, type MotionProps, motion } from 'framer-motion';
import { containerVariants, itemVariants } from './animation-variants';
import type { AnimatedListenInterfaceProps } from './types';
import { useAnimatedListenInterface } from './useAnimatedListenInterface';

// Animation constants
const HOVER_SCALE = 1.02;
const TAP_SCALE = 0.98;
const HOVER_Y_OFFSET = -2;
const HOVER_DURATION = 0.2;
const TAP_DURATION = 0.1;
const SHIMMER_DURATION = 0.6;
const SHIMMER_OPACITY = 0.2;
const BUTTON_SCALE_SELECTED = 1.05;
const ICON_ROTATION_FULL = 360;
const SMOOTH_EASE = [0.16, 1, 0.3, 1] as const;

// Helper functions to reduce cognitive complexity
function getHoverProps(reduceMotion: boolean): MotionProps['whileHover'] {
  if (reduceMotion) return undefined;
  return {
    scale: HOVER_SCALE,
    y: HOVER_Y_OFFSET,
    transition: { duration: HOVER_DURATION, ease: [...SMOOTH_EASE] as const },
  };
}

function getTapProps(reduceMotion: boolean): MotionProps['whileTap'] {
  if (reduceMotion) return undefined;
  return { scale: TAP_SCALE, transition: { duration: TAP_DURATION } };
}

function getShimmerAnimate(reduceMotion: boolean, isSelected: boolean) {
  if (reduceMotion) {
    return { opacity: isSelected ? SHIMMER_OPACITY : 0 };
  }
  return { x: isSelected ? '200%' : '-100%' };
}

function getShimmerTransition(reduceMotion: boolean) {
  if (reduceMotion) return { duration: 0 };
  return { duration: SHIMMER_DURATION, ease: [...SMOOTH_EASE] as const };
}

function getIconAnimate(reduceMotion: boolean, isSelected: boolean) {
  if (reduceMotion) return undefined;
  return { rotate: isSelected ? [0, ICON_ROTATION_FULL] : 0 };
}

function getIconTransition(reduceMotion: boolean) {
  if (reduceMotion) return { duration: 0 };
  return { duration: SHIMMER_DURATION, ease: [...SMOOTH_EASE] as const };
}

function getSpinnerInitial(reduceMotion: boolean) {
  return reduceMotion ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0 };
}

export function AnimatedListenInterface({
  artist,
  handle,
  enableDynamicEngagement = false,
}: AnimatedListenInterfaceProps) {
  const {
    availableDSPs,
    selectedDSP,
    prefersReducedMotion,
    sanitizedLogos,
    handleDSPClick,
  } = useAnimatedListenInterface(artist, handle, enableDynamicEngagement);

  const reduceMotion = Boolean(prefersReducedMotion);
  const variants = reduceMotion ? undefined : containerVariants;
  const items = reduceMotion ? undefined : itemVariants;

  return (
    <AnimatePresence mode='wait'>
      <motion.div
        key='listen-interface'
        variants={variants}
        initial={reduceMotion ? { opacity: 1 } : 'hidden'}
        animate={reduceMotion ? { opacity: 1 } : 'visible'}
        exit={reduceMotion ? { opacity: 0 } : 'exit'}
        className='w-full max-w-sm'
      >
        <motion.div variants={items} className='space-y-3'>
          {availableDSPs.length === 0 ? (
            <div className='bg-surface-0 backdrop-blur-lg border border-subtle rounded-2xl p-8 shadow-xl text-center'>
              <p className='text-sm text-secondary-token'>
                Streaming links aren&apos;t available for this profile yet.
              </p>
            </div>
          ) : (
            availableDSPs.map(dsp => {
              const isSelected = selectedDSP === dsp.key;
              return (
                <motion.button
                  key={dsp.key}
                  onClick={() => handleDSPClick(dsp)}
                  disabled={isSelected}
                  variants={items}
                  whileHover={getHoverProps(reduceMotion)}
                  whileTap={getTapProps(reduceMotion)}
                  className='w-full group relative overflow-hidden rounded-xl p-4 font-semibold text-base transition-all duration-300 ease-out shadow-lg hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-white/50 disabled:cursor-not-allowed'
                  style={{
                    backgroundColor: dsp.config.color,
                    color: dsp.config.textColor,
                  }}
                  aria-label={`Open in ${dsp.name} app if installed, otherwise opens in web browser`}
                >
                  <motion.div
                    className='absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-white/20 to-transparent dark:via-white/10'
                    animate={getShimmerAnimate(reduceMotion, isSelected)}
                    transition={getShimmerTransition(reduceMotion)}
                  />

                  <motion.span
                    className='relative flex items-center justify-center gap-3'
                    animate={{ scale: isSelected ? BUTTON_SCALE_SELECTED : 1 }}
                    transition={{ duration: HOVER_DURATION }}
                  >
                    <motion.span
                      className='flex items-center'
                      // biome-ignore lint/security/noDangerouslySetInnerHtml: SVG sanitized with DOMPurify
                      dangerouslySetInnerHTML={{
                        __html: sanitizedLogos[dsp.key],
                      }}
                      animate={getIconAnimate(reduceMotion, isSelected)}
                      transition={getIconTransition(reduceMotion)}
                    />
                    <span>
                      {isSelected ? 'Opening...' : `Open in ${dsp.name}`}
                    </span>
                    {isSelected && (
                      <motion.div
                        initial={getSpinnerInitial(reduceMotion)}
                        animate={{ opacity: 1, scale: 1 }}
                        className='w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin motion-reduce:animate-none'
                      />
                    )}
                  </motion.span>
                </motion.button>
              );
            })
          )}
        </motion.div>

        <motion.p
          variants={items}
          className='text-xs text-tertiary-token text-center mt-6'
        >
          Tap to open in the app or your browser
        </motion.p>
      </motion.div>
    </AnimatePresence>
  );
}
