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
      className='relative section-spacing-linear overflow-hidden'
      style={{
        backgroundColor: 'var(--linear-bg-page)',
        borderTop: '1px solid var(--linear-border-subtle)',
      }}
      aria-label='Comparison: Traditional link pages versus Jovie Profile'
    >
      {/* Subtle background grid */}
      <div
        className='absolute inset-0 opacity-[0.15]'
        style={{
          backgroundImage: `linear-gradient(var(--linear-border-subtle) 1px, transparent 1px),
                           linear-gradient(90deg, var(--linear-border-subtle) 1px, transparent 1px)`,
          backgroundSize: '48px 48px',
        }}
      />

      <Container size='homepage' className='relative z-10'>
        {/* Section Header */}
        <motion.div
          {...fadeInUp}
          viewport={{ once: true }}
          transition={{ duration: reducedMotion ? 0 : 0.5 }}
          className='text-center heading-gap-linear'
        >
          <h2
            style={{
              fontSize: 'var(--linear-h2-size)',
              fontWeight: 'var(--linear-font-weight-medium)',
              lineHeight: 'var(--linear-h2-leading)',
              letterSpacing: 'var(--linear-h2-tracking)',
              color: 'var(--linear-text-primary)',
              marginBottom: 'var(--linear-space-4)',
            }}
          >
            One action. The right one.
          </h2>
          <p
            className='max-w-xl mx-auto'
            style={{
              fontSize: 'var(--linear-body-lg-size)',
              lineHeight: 'var(--linear-body-lg-leading)',
              color: 'var(--linear-text-tertiary)',
            }}
          >
            Traditional link pages scatter attention. Jovie profiles focus it.
          </p>
        </motion.div>

        {/* Comparison Grid */}
        <div
          className='grid md:grid-cols-2 items-center max-w-4xl mx-auto relative'
          style={{ gap: 'var(--linear-space-20)' }}
        >
          {/* VS Divider */}
          <div className='hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10'>
            <div
              className='px-3 py-1.5 rounded-md'
              style={{
                backgroundColor: 'var(--linear-bg-surface-0)',
                border: '1px solid var(--linear-border-default)',
              }}
            >
              <span
                className='tracking-wider uppercase'
                style={{
                  fontSize: 'var(--linear-label-size)',
                  fontWeight: 'var(--linear-font-weight-medium)',
                  color: 'var(--linear-text-tertiary)',
                }}
              >
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
              <h3
                style={{
                  fontSize: 'var(--linear-h4-size)',
                  fontWeight: 'var(--linear-h4-weight)',
                  color: 'var(--linear-text-primary)',
                  marginBottom: 'var(--linear-space-1)',
                }}
              >
                Traditional Link Pages
              </h3>
              <p
                style={{
                  fontSize: 'var(--linear-body-sm-size)',
                  color: 'var(--linear-text-tertiary)',
                }}
              >
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
              <div
                className='flex items-center justify-center'
                style={{
                  gap: 'var(--linear-space-3)',
                  marginBottom: 'var(--linear-space-3)',
                }}
              >
                <div
                  className='inline-flex items-center h-6 px-2.5 rounded-full'
                  style={{
                    gap: 'var(--linear-space-2)',
                    backgroundColor: 'oklch(72% 0.2 145 / 0.15)',
                    border: '1px solid oklch(72% 0.2 145 / 0.2)',
                  }}
                >
                  <TrendingUp
                    className='w-3 h-3'
                    style={{ color: 'var(--linear-success)' }}
                  />
                  <span
                    style={{
                      fontSize: 'var(--linear-label-size)',
                      fontWeight: 'var(--linear-font-weight-medium)',
                      color: 'var(--linear-success)',
                    }}
                  >
                    2–5× Conversions
                  </span>
                </div>
              </div>
              <h3
                style={{
                  fontSize: 'var(--linear-h4-size)',
                  fontWeight: 'var(--linear-h4-weight)',
                  color: 'var(--linear-text-primary)',
                  marginBottom: 'var(--linear-space-1)',
                }}
              >
                Jovie Profile
              </h3>
              <p
                style={{
                  fontSize: 'var(--linear-body-sm-size)',
                  color: 'var(--linear-text-tertiary)',
                }}
              >
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
