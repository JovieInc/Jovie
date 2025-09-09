'use client';

import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface AnimatedAccordionProps {
  isOpen: boolean;
  children: React.ReactNode;
  className?: string;
  /**
   * Optional delay before starting the animation (in seconds)
   * @default 0
   */
  delay?: number;
  /**
   * Optional duration for the animation (in seconds)
   * @default 0.3
   */
  duration?: number;
}

export function AnimatedAccordion({
  isOpen,
  children,
  className,
  delay = 0,
  duration = 0.3,
}: AnimatedAccordionProps) {
  const shouldReduceMotion = useReducedMotion();
  
  // Motion variants for the container
  const containerVariants = {
    open: {
      opacity: 1,
      height: 'auto',
      transition: {
        height: { 
          duration: shouldReduceMotion ? 0 : duration,
          ease: [0.32, 0.72, 0.32, 0.98],
          delay: shouldReduceMotion ? 0 : delay
        },
        opacity: { 
          duration: shouldReduceMotion ? 0 : duration * 0.7,
          ease: [0.32, 0, 0.67, 1],
          delay: shouldReduceMotion ? 0 : delay * 1.2
        },
      },
    },
    collapsed: {
      opacity: 0,
      height: 0,
      transition: {
        height: { 
          duration: shouldReduceMotion ? 0 : duration * 0.8,
          ease: [0.32, 0.72, 0.32, 0.98],
          delay: shouldReduceMotion ? 0 : 0.05
        },
        opacity: { 
          duration: shouldReduceMotion ? 0 : duration * 0.5,
          ease: [0.32, 0, 0.67, 1]
        },
      },
    },
  };

  // Motion variants for the content
  const contentVariants = {
    open: {
      y: 0,
      opacity: 1,
      transition: {
        y: { 
          type: 'spring',
          stiffness: 500,
          damping: 30,
          delay: shouldReduceMotion ? 0 : delay + 0.05,
        },
        opacity: {
          duration: shouldReduceMotion ? 0 : duration * 0.8,
          ease: [0.32, 0, 0.67, 1],
          delay: shouldReduceMotion ? 0 : delay + 0.1,
        },
      },
    },
    collapsed: {
      y: -8,
      opacity: 0,
      transition: {
        y: { 
          type: 'spring',
          stiffness: 500,
          damping: 30,
        },
        opacity: {
          duration: shouldReduceMotion ? 0 : duration * 0.5,
          ease: [0.32, 0, 0.67, 1],
        },
      },
    },
  };

  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          initial="collapsed"
          animate="open"
          exit="collapsed"
          variants={shouldReduceMotion ? undefined : containerVariants}
          className={cn('overflow-hidden', className)}
          style={shouldReduceMotion ? { display: isOpen ? 'block' : 'none' } : undefined}
        >
          <motion.div
            variants={shouldReduceMotion ? undefined : contentVariants}
            className="origin-top"
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
