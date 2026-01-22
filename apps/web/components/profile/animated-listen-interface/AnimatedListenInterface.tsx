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

// Pre-computed motion props to reduce cognitive complexity in render
const hoverProps: MotionProps['whileHover'] = {
  scale: HOVER_SCALE,
  y: HOVER_Y_OFFSET,
  transition: { duration: HOVER_DURATION, ease: [0.16, 1, 0.3, 1] },
};

const tapProps: MotionProps['whileTap'] = {
  scale: TAP_SCALE,
  transition: { duration: TAP_DURATION },
};

const shimmerTransition = {
  duration: SHIMMER_DURATION,
  ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
};

function getShimmerAnimate(isSelected: boolean, prefersReducedMotion: boolean) {
  if (prefersReducedMotion) {
    return { opacity: isSelected ? SHIMMER_OPACITY : 0 };
  }
  return { x: isSelected ? '200%' : '-100%' };
}

function getIconAnimate(isSelected: boolean, prefersReducedMotion: boolean) {
  if (prefersReducedMotion) return undefined;
  return { rotate: isSelected ? [0, ICON_ROTATION_FULL] : 0 };
}

function getSpinnerInitial(prefersReducedMotion: boolean) {
  return prefersReducedMotion
    ? { opacity: 1, scale: 1 }
    : { opacity: 0, scale: 0 };
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
            availableDSPs.map(dsp => {
              const isSelected = selectedDSP === dsp.key;
              return (
                <motion.button
                  key={dsp.key}
                  onClick={() => handleDSPClick(dsp)}
                  disabled={isSelected}
                  variants={prefersReducedMotion ? undefined : itemVariants}
                  whileHover={prefersReducedMotion ? undefined : hoverProps}
                  whileTap={prefersReducedMotion ? undefined : tapProps}
                  className='w-full group relative overflow-hidden rounded-xl p-4 font-semibold text-base transition-all duration-300 ease-out shadow-lg hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-white/50 disabled:cursor-not-allowed'
                  style={{
                    backgroundColor: dsp.config.color,
                    color: dsp.config.textColor,
                  }}
                  aria-label={`Open in ${dsp.name} app if installed, otherwise opens in web browser`}
                >
                  {/* Shimmer effect overlay */}
                  <motion.div
                    className='absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-white/20 to-transparent dark:via-white/10'
                    animate={getShimmerAnimate(
                      isSelected,
                      prefersReducedMotion
                    )}
                    transition={
                      prefersReducedMotion ? { duration: 0 } : shimmerTransition
                    }
                  />

                  {/* Button content */}
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
                      animate={getIconAnimate(isSelected, prefersReducedMotion)}
                      transition={
                        prefersReducedMotion
                          ? { duration: 0 }
                          : shimmerTransition
                      }
                    />
                    <span>
                      {isSelected ? 'Opening...' : `Open in ${dsp.name}`}
                    </span>
                    {isSelected && (
                      <motion.div
                        initial={getSpinnerInitial(prefersReducedMotion)}
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
