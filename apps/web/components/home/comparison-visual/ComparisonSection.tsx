'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { TrendingUp } from 'lucide-react';
import { useMemo } from 'react';
import { Container } from '@/components/site/Container';
import { ComparisonCanvas } from './ComparisonCanvas';

export function ComparisonSection() {
  const reducedMotion = useReducedMotion();

  // Create variants that respect reduced motion preference
  const fadeInUp = useMemo(
    () => ({
      initial: reducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 },
      whileInView: { opacity: 1, y: 0 },
    }),
    [reducedMotion]
  );

  const fadeInLeft = useMemo(
    () => ({
      initial: reducedMotion ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 },
      whileInView: { opacity: 1, x: 0 },
    }),
    [reducedMotion]
  );

  const fadeInRight = useMemo(
    () => ({
      initial: reducedMotion ? { opacity: 1, x: 0 } : { opacity: 0, x: 20 },
      whileInView: { opacity: 1, x: 0 },
    }),
    [reducedMotion]
  );

  return (
    <section
      className='section-spacing-linear bg-base border-t border-subtle overflow-hidden'
      aria-label='Comparison: Wall of Links versus Jovie Profile'
    >
      <Container size='homepage'>
        {/* Header */}
        <div className='max-w-3xl mx-auto text-center mb-16'>
          <motion.h2
            {...fadeInUp}
            viewport={{ once: true }}
            transition={{ duration: reducedMotion ? 0 : 0.5 }}
            className='marketing-h2-linear text-primary-token mb-4'
          >
            One action. The right one.
          </motion.h2>
          <motion.p
            {...fadeInUp}
            viewport={{ once: true }}
            transition={{
              duration: reducedMotion ? 0 : 0.5,
              delay: reducedMotion ? 0 : 0.1,
            }}
            className='marketing-lead-linear text-tertiary-token'
          >
            Stop losing visitors to decision fatigue
          </motion.p>
        </div>

        {/* Two-column comparison grid */}
        <div className='grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16 max-w-5xl mx-auto'>
          {/* Left - Traditional */}
          <motion.div
            {...fadeInLeft}
            viewport={{ once: true }}
            transition={{
              duration: reducedMotion ? 0 : 0.5,
              delay: reducedMotion ? 0 : 0.2,
            }}
            className='relative'
          >
            <ComparisonCanvas side='left' />

            {/* Labels below */}
            <div className='mt-8'>
              <h3 className='text-lg font-semibold text-primary-token mb-1'>
                Traditional Link Pages
              </h3>
              <p className='text-sm text-tertiary-token'>
                Too many choices cause decision fatigue
              </p>
            </div>
          </motion.div>

          {/* Right - Jovie */}
          <motion.div
            {...fadeInRight}
            viewport={{ once: true }}
            transition={{
              duration: reducedMotion ? 0 : 0.5,
              delay: reducedMotion ? 0 : 0.3,
            }}
            className='relative'
          >
            <ComparisonCanvas side='right' />

            {/* Labels below */}
            <div className='mt-8'>
              <div className='flex items-center gap-2 mb-3'>
                <div className='inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-success-subtle border border-success/20'>
                  <TrendingUp className='w-4 h-4 text-success' />
                  <span className='text-sm font-medium text-success'>
                    2–5× higher conversion
                  </span>
                </div>
              </div>
              <h3 className='text-lg font-semibold text-primary-token mb-1'>
                Jovie Profile
              </h3>
              <p className='text-sm text-tertiary-token'>
                Single-CTA pages outperform multi-link pages
              </p>
            </div>
          </motion.div>
        </div>
      </Container>
    </section>
  );
}
