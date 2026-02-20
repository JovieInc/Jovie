'use client';

import { motion, useReducedMotion } from 'motion/react';

import { Container } from '@/components/site/Container';

import { MobileProfilePreview } from './MobileProfilePreview';
import { PhoneFrame } from './PhoneFrame';

export function ProductShowcase() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <section
      className='section-spacing-linear'
      style={{ backgroundColor: 'var(--linear-bg-page)' }}
    >
      <Container size='homepage'>
        <div className='grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16'>
          {/* Left — text */}
          <div className='text-center lg:text-left'>
            <p
              className='mb-3 uppercase'
              style={{
                fontSize: '13px',
                fontWeight: 510,
                letterSpacing: '0.08em',
                color: 'var(--linear-text-tertiary)',
              }}
            >
              See it in action
            </p>
            <h2
              className='mb-4'
              style={{
                fontSize: 'clamp(28px, 4vw, 48px)',
                fontWeight: 510,
                lineHeight: 1,
                letterSpacing: '-0.022em',
                color: 'var(--linear-text-primary)',
              }}
            >
              Your profile, built in seconds
            </h2>
            <p
              className='mx-auto max-w-md lg:mx-0'
              style={{
                fontSize: '15px',
                fontWeight: 400,
                lineHeight: '24px',
                letterSpacing: '-0.011em',
                color: 'var(--linear-text-secondary)',
              }}
            >
              A single link that showcases your music, captures fan contacts,
              and drives listeners to the right streaming destination. No design
              skills needed.
            </p>
          </div>

          {/* Right — 3D phone mockup */}
          <motion.div
            className='flex justify-center lg:justify-end'
            initial={
              prefersReducedMotion
                ? { opacity: 1, x: 0 }
                : { opacity: 0, x: 40 }
            }
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            <div
              className='group hidden lg:block'
              style={{ perspective: '1000px' }}
            >
              <div
                className='transition-transform duration-500 hover:[transform:rotateY(-3deg)_rotateX(1deg)]'
                style={{
                  transform: 'rotateY(-8deg) rotateX(3deg)',
                  transformStyle: 'preserve-3d',
                }}
              >
                <PhoneFrame>
                  <MobileProfilePreview />
                </PhoneFrame>
              </div>
            </div>

            {/* Mobile: flat, no 3D */}
            <div className='lg:hidden'>
              <PhoneFrame>
                <MobileProfilePreview />
              </PhoneFrame>
            </div>
          </motion.div>
        </div>
      </Container>
    </section>
  );
}
