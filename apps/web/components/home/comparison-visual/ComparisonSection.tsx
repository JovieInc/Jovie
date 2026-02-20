'use client';

import { ArrowRight, TrendingUp, X } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useMemo } from 'react';
import { Container } from '@/components/site/Container';
import { JovieProfileUI } from './JovieProfileUI';
import { WallOfLinksUI } from './WallOfLinksUI';

export function ComparisonSection() {
  const reducedMotion = useReducedMotion();

  const fadeInUp = useMemo(
    () => ({
      initial: reducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 },
      whileInView: { opacity: 1, y: 0 },
    }),
    [reducedMotion]
  );

  const fadeInLeft = useMemo(
    () => ({
      initial: reducedMotion ? { opacity: 1, x: 0 } : { opacity: 0, x: -16 },
      whileInView: { opacity: 1, x: 0 },
    }),
    [reducedMotion]
  );

  const fadeInRight = useMemo(
    () => ({
      initial: reducedMotion ? { opacity: 1, x: 0 } : { opacity: 0, x: 16 },
      whileInView: { opacity: 1, x: 0 },
    }),
    [reducedMotion]
  );

  return (
    <section
      className='relative section-spacing-linear overflow-hidden'
      style={{
        backgroundColor: 'var(--linear-bg-page)',
      }}
      aria-label='Comparison: Traditional link pages versus Jovie Profile'
    >
      {/* Ambient background — dot grid like Linear's section backgrounds */}
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0'
        style={{
          backgroundImage:
            'radial-gradient(circle, var(--linear-border-subtle) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
          opacity: 0.5,
        }}
      />

      <Container size='homepage' className='relative z-10'>
        {/* Section Header */}
        <motion.div
          {...fadeInUp}
          viewport={{ once: true }}
          transition={{
            duration: reducedMotion ? 0 : 0.5,
            ease: [0.25, 0.46, 0.45, 0.94],
          }}
          className='text-center heading-gap-linear'
        >
          <p
            className='mb-4 uppercase'
            style={{
              fontSize: '13px',
              fontWeight: 510,
              letterSpacing: '0.08em',
              color: 'var(--linear-text-tertiary)',
            }}
          >
            Why Jovie
          </p>
          <h2
            style={{
              fontSize: 'var(--linear-h2-size)',
              fontWeight: 'var(--linear-font-weight-medium)',
              lineHeight: 'var(--linear-h2-leading)',
              letterSpacing: 'var(--linear-h2-tracking)',
              color: 'var(--linear-text-primary)',
              marginBottom: '16px',
            }}
          >
            Turn profile traffic into
            <br />
            meaningful action.
          </h2>
          <p
            className='max-w-lg mx-auto'
            style={{
              fontSize: '15px',
              lineHeight: '24px',
              letterSpacing: '-0.011em',
              color: 'var(--linear-text-tertiary)',
            }}
          >
            Traditional link pages spread attention thin. Jovie keeps focus on
            the action that matters most.
          </p>
        </motion.div>

        {/* Comparison Grid */}
        <div
          className='grid md:grid-cols-[1fr_auto_1fr] items-start max-w-4xl mx-auto relative'
          style={{ gap: '0' }}
        >
          {/* Left Side - Traditional */}
          <motion.div
            {...fadeInLeft}
            viewport={{ once: true }}
            transition={{
              duration: reducedMotion ? 0 : 0.5,
              delay: reducedMotion ? 0 : 0.15,
              ease: [0.25, 0.46, 0.45, 0.94],
            }}
            className='relative flex flex-col items-center'
          >
            {/* Label */}
            <div
              className='mb-5 inline-flex items-center h-7 px-3 rounded-full mx-auto'
              style={{
                gap: '6px',
                backgroundColor: 'rgba(255, 80, 80, 0.08)',
                border: '1px solid rgba(255, 80, 80, 0.12)',
              }}
            >
              <X className='w-3 h-3' style={{ color: 'oklch(65% 0.18 25)' }} />
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 510,
                  color: 'oklch(65% 0.18 25)',
                  letterSpacing: '-0.005em',
                }}
              >
                Traditional Link Pages
              </span>
            </div>

            <WallOfLinksUI />

            <p
              className='mt-5 text-center'
              style={{
                fontSize: '13px',
                color: 'var(--linear-text-tertiary)',
                letterSpacing: '-0.01em',
                maxWidth: '240px',
              }}
            >
              More links. Less action.
              <br />
              Visitors bounce without converting.
            </p>
          </motion.div>

          {/* Center Divider */}
          <div className='hidden md:flex flex-col items-center justify-center self-center px-6 lg:px-10'>
            <div
              className='flex items-center justify-center w-10 h-10 rounded-full'
              style={{
                backgroundColor: 'var(--linear-bg-surface-2)',
                border: '1px solid var(--linear-border-default)',
              }}
            >
              <ArrowRight
                className='w-4 h-4'
                style={{ color: 'var(--linear-text-tertiary)' }}
              />
            </div>
          </div>

          {/* Mobile divider */}
          <div className='flex md:hidden items-center justify-center py-8'>
            <div
              className='flex items-center justify-center w-10 h-10 rounded-full'
              style={{
                backgroundColor: 'var(--linear-bg-surface-2)',
                border: '1px solid var(--linear-border-default)',
              }}
            >
              <ArrowRight
                className='w-4 h-4 rotate-90'
                style={{ color: 'var(--linear-text-tertiary)' }}
              />
            </div>
          </div>

          {/* Right Side - Jovie */}
          <motion.div
            {...fadeInRight}
            viewport={{ once: true }}
            transition={{
              duration: reducedMotion ? 0 : 0.5,
              delay: reducedMotion ? 0 : 0.25,
              ease: [0.25, 0.46, 0.45, 0.94],
            }}
            className='relative flex flex-col items-center'
          >
            {/* Label */}
            <div
              className='mb-5 inline-flex items-center h-7 px-3 rounded-full mx-auto'
              style={{
                gap: '6px',
                backgroundColor: 'oklch(72% 0.2 145 / 0.08)',
                border: '1px solid oklch(72% 0.2 145 / 0.15)',
              }}
            >
              <TrendingUp
                className='w-3 h-3'
                style={{ color: 'var(--linear-success)' }}
              />
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 510,
                  color: 'var(--linear-success)',
                  letterSpacing: '-0.005em',
                }}
              >
                Jovie Profile
              </span>
            </div>

            <JovieProfileUI />

            <p
              className='mt-5 text-center'
              style={{
                fontSize: '13px',
                color: 'var(--linear-text-tertiary)',
                letterSpacing: '-0.01em',
                maxWidth: '240px',
              }}
            >
              Clear primary CTA.
              <br />
              Optimized for artist growth.
            </p>
          </motion.div>
        </div>
      </Container>
    </section>
  );
}
