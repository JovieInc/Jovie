'use client';

import type { Variants } from 'motion/react';
import { useMemo, useState } from 'react';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import type { UseAnimatedArtistPageReturn } from './types';

export function useAnimatedArtistPage(): UseAnimatedArtistPageReturn {
  const [isNavigating, setIsNavigating] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const tippingEnabled = true;

  const pageVariants: Variants = useMemo(() => {
    if (prefersReducedMotion) {
      return {
        initial: { opacity: 1 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
      };
    }

    return {
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
          ease: [0.16, 1, 0.3, 1],
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
  }, [prefersReducedMotion]);

  return {
    isNavigating,
    setIsNavigating,
    prefersReducedMotion,
    tippingEnabled,
    pageVariants,
  };
}
