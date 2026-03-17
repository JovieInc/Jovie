'use client';

import { AnimatePresence, motion } from 'motion/react';
import { DSP_LOGO_CONFIG } from '@/components/atoms/DspLogo';
import { SmartLinkProviderButton } from '@/features/release/SmartLinkProviderButton';
import { containerVariants, itemVariants } from './animation-variants';
import type { AnimatedListenInterfaceProps } from './types';
import { useAnimatedListenInterface } from './useAnimatedListenInterface';

export function AnimatedListenInterface({
  artist,
  handle,
  enableDynamicEngagement = false,
}: AnimatedListenInterfaceProps) {
  const { availableDSPs, selectedDSP, prefersReducedMotion, handleDSPClick } =
    useAnimatedListenInterface(artist, handle, enableDynamicEngagement);

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
        <motion.div
          variants={prefersReducedMotion ? undefined : itemVariants}
          className='space-y-3'
        >
          {availableDSPs.length === 0 ? (
            <div className='bg-surface-0 backdrop-blur-sm border border-subtle rounded-xl p-6 shadow-sm text-center'>
              <p className='text-sm text-secondary-token'>
                Streaming links aren&apos;t available for this profile yet.
              </p>
            </div>
          ) : (
            availableDSPs.map(dsp => {
              const isSelected = selectedDSP === dsp.key;
              const logoConfig =
                DSP_LOGO_CONFIG[dsp.key as keyof typeof DSP_LOGO_CONFIG];

              return (
                <motion.div
                  key={dsp.key}
                  variants={prefersReducedMotion ? undefined : itemVariants}
                >
                  <SmartLinkProviderButton
                    onClick={() => handleDSPClick(dsp)}
                    label={isSelected ? `Opening ${dsp.name}...` : dsp.name}
                    iconPath={logoConfig?.iconPath}
                    className={isSelected ? 'opacity-60' : undefined}
                  />
                </motion.div>
              );
            })
          )}
        </motion.div>

        <motion.p
          variants={prefersReducedMotion ? undefined : itemVariants}
          className='text-xs text-tertiary-token text-center mt-6'
        >
          Your preferred app opens first next time.
        </motion.p>
      </motion.div>
    </AnimatePresence>
  );
}
