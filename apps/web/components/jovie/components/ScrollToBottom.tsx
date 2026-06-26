'use client';

import { ArrowDown } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

interface ScrollToBottomProps {
  readonly visible: boolean;
  readonly onClick: () => void;
}

/**
 * Floating button that appears when the user scrolls up in the chat,
 * allowing them to quickly jump back to the latest messages.
 */
export function ScrollToBottom({ visible, onClick }: ScrollToBottomProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          type='button'
          onClick={onClick}
          initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
          exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
          transition={{ duration: 0.15 }}
          className='system-b-scroll-to-bottom'
          aria-label='Scroll To Latest Messages'
        >
          <span className='system-b-scroll-to-bottom-icon'>
            <ArrowDown className='h-3 w-3' />
          </span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
