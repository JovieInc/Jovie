'use client';

import { ArrowDown } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

import { cn } from '@/lib/utils';

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
          className={cn(
            'absolute bottom-2 left-1/2 -translate-x-1/2 z-10',
            'flex items-center gap-1.5 rounded-full',
            'border border-subtle bg-surface-1/90 backdrop-blur-sm',
            'px-3 py-1.5 text-xs font-medium text-secondary-token',
            'shadow-sm transition-colors',
            'hover:bg-surface-2 hover:text-primary-token',
            'focus:outline-none focus:ring-2 focus:ring-accent/20'
          )}
          aria-label='Scroll to latest messages'
        >
          <ArrowDown className='h-3 w-3' />
          Back to bottom
        </motion.button>
      )}
    </AnimatePresence>
  );
}
