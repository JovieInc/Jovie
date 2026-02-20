'use client';

import { motion, useReducedMotion } from 'motion/react';

import { Container } from '@/components/site/Container';

import {
  ArmadaMusicLogo,
  AwalLogo,
  SonyMusicLogo,
  UniversalMusicGroupLogo,
} from './label-logos';

const fadeUp = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0 },
};

export function LabelLogosBar() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <section
      aria-label='Record labels using Jovie'
      className='bg-[var(--linear-bg-page)] pb-14 pt-0 sm:pb-20'
    >
      <Container size='homepage'>
        {/* Centered gradient separator — Linear uses subtle gradient dividers */}
        <div
          aria-hidden='true'
          className='mb-10 h-px sm:mb-14'
          style={{
            background:
              'linear-gradient(to right, transparent, var(--linear-separator-via), transparent)',
          }}
        />

        <p
          className='mb-5 text-center uppercase'
          style={{
            fontSize: '13px',
            fontWeight: 510,
            letterSpacing: '0.08em',
            color: 'var(--linear-text-tertiary)',
          }}
        >
          Trusted by artists on
        </p>

        <motion.div
          className='flex flex-wrap items-center justify-center gap-x-10 gap-y-5'
          initial={prefersReducedMotion ? 'visible' : 'hidden'}
          whileInView='visible'
          viewport={{ once: true, margin: '-40px' }}
          transition={{ staggerChildren: 0.08 }}
        >
          <motion.div variants={fadeUp} transition={{ duration: 0.4 }}>
            <SonyMusicLogo
              className='h-4 w-auto select-none transition-opacity duration-[160ms] hover:opacity-70'
              style={{ color: 'var(--linear-text-tertiary)' }}
            />
          </motion.div>
          <motion.div variants={fadeUp} transition={{ duration: 0.4 }}>
            <UniversalMusicGroupLogo
              className='h-3 w-auto select-none transition-opacity duration-[160ms] hover:opacity-70'
              style={{ color: 'var(--linear-text-tertiary)' }}
            />
          </motion.div>
          <motion.div variants={fadeUp} transition={{ duration: 0.4 }}>
            <AwalLogo
              className='h-[18px] w-auto select-none transition-opacity duration-[160ms] hover:opacity-70'
              style={{ color: 'var(--linear-text-tertiary)' }}
            />
          </motion.div>
          <motion.div variants={fadeUp} transition={{ duration: 0.4 }}>
            <ArmadaMusicLogo
              className='h-5 w-auto select-none transition-opacity duration-[160ms] hover:opacity-70'
              style={{ color: 'var(--linear-text-tertiary)' }}
            />
          </motion.div>
        </motion.div>
      </Container>
    </section>
  );
}
