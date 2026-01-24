'use client';

import { TrendingUp } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useMemo } from 'react';
import { Container } from '@/components/site/Container';
import { JovieProfileUI } from './JovieProfileUI';
import { WallOfLinksUI } from './WallOfLinksUI';

export function ComparisonSection() {
  const reducedMotion = useReducedMotion();

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
      className='relative section-spacing-linear bg-base border-t border-subtle overflow-hidden'
      aria-label='Comparison: Traditional link pages versus Jovie Profile'
    >
      {/* Subtle background grid */}
      <div
        className='absolute inset-0 opacity-[0.4] dark:opacity-[0.15]'
        style={{
          backgroundImage: `linear-gradient(var(--color-border-subtle) 1px, transparent 1px),
                           linear-gradient(90deg, var(--color-border-subtle) 1px, transparent 1px)`,
          backgroundSize: '48px 48px',
        }}
      />

      <Container size='homepage' className='relative z-10'>
        {/* Section Header */}
        <motion.div
          {...fadeInUp}
          viewport={{ once: true }}
          transition={{ duration: reducedMotion ? 0 : 0.5 }}
          className='text-center mb-16'
        >
          <h2 className='marketing-h2-linear text-primary-token mb-3'>
            One action. The right one.
          </h2>
          <p className='marketing-lead-linear text-tertiary-token max-w-xl mx-auto'>
            Traditional link pages scatter attention. Jovie profiles focus it.
          </p>
        </motion.div>

        {/* Comparison Grid */}
        <div className='grid md:grid-cols-2 gap-12 items-center max-w-4xl mx-auto relative'>
          {/* VS Divider */}
          <div className='hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10'>
            <div className='px-3 py-1.5 rounded-md bg-surface-0 border border-subtle'>
              <span className='text-xs font-medium text-tertiary-token tracking-wider uppercase'>
                vs
              </span>
            </div>
          </div>

          {/* Left Side - Traditional */}
          <motion.div
            {...fadeInLeft}
            viewport={{ once: true }}
            transition={{
              duration: reducedMotion ? 0 : 0.5,
              delay: reducedMotion ? 0 : 0.2,
            }}
            className='relative'
          >
            <WallOfLinksUI />

            <div className='mt-8 text-center'>
              <h3 className='text-lg font-semibold text-primary-token mb-1'>
                Traditional Link Pages
              </h3>
              <p className='text-sm text-tertiary-token'>
                More links. Less action.
              </p>
            </div>
          </motion.div>

          {/* Right Side - Jovie */}
          <motion.div
            {...fadeInRight}
            viewport={{ once: true }}
            transition={{
              duration: reducedMotion ? 0 : 0.5,
              delay: reducedMotion ? 0 : 0.3,
            }}
            className='relative'
          >
            <JovieProfileUI />

            <div className='mt-8 text-center'>
              <div className='flex items-center justify-center gap-3 mb-3'>
                <div className='inline-flex items-center gap-2 h-6 px-2.5 rounded-full bg-success-subtle border border-success/20'>
                  <TrendingUp className='w-3 h-3 text-success' />
                  <span className='text-xs font-medium text-success'>
                    2–5× Conversions
                  </span>
                </div>
              </div>
              <h3 className='text-lg font-semibold text-primary-token mb-1'>
                Jovie Profile
              </h3>
              <p className='text-sm text-tertiary-token'>
                One perfect CTA.
                <br />
                Personalized for each visitor.
              </p>
            </div>
          </motion.div>
        </div>
      </Container>
    </section>
  );
}
