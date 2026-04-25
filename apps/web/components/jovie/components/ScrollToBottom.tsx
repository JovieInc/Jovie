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
            'absolute bottom-3 left-1/2 z-10 -translate-x-1/2',
            'inline-flex items-center gap-2 rounded-full',
            'border border-subtle bg-surface-1/95 px-3.5 py-2 backdrop-blur',
            'text-2xs font-medium uppercase tracking-[0.16em] text-secondary-token',
            'shadow-[0_10px_32px_-20px_rgba(15,23,42,0.7)] transition-all',
            'hover:-translate-y-0.5 hover:bg-surface-2 hover:text-primary-token',
            'focus:outline-none focus:ring-2 focus:ring-accent/20'
          )}
          aria-label='Scroll to latest messages'
        >
          <span className='flex h-5 w-5 items-center justify-center rounded-full bg-surface-2 text-primary-token'>
            <ArrowDown className='h-3 w-3' />
          </span>{' '}
          Latest
        </motion.button>
      )}
    </AnimatePresence>
  );
}
