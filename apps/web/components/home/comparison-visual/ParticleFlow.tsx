'use client';

import { AnimatePresence, motion } from 'framer-motion';
import type { Particle } from './useParticleFlow';

interface ParticleFlowProps {
  particles: Particle[];
  prefersReducedMotion: boolean;
}

export function ParticleFlow({
  particles,
  prefersReducedMotion,
}: ParticleFlowProps) {
  if (prefersReducedMotion) {
    return <StaticFlowIndicators />;
  }

  return (
    <svg
      className='absolute inset-0 pointer-events-none overflow-visible'
      style={{ zIndex: 10 }}
      role='img'
      aria-label='Animated particles showing traffic flow'
    >
      <title>Traffic flow visualization</title>
      <defs>
        {/* White glow for all particles */}
        <radialGradient id='particle-white' cx='50%' cy='50%' r='50%'>
          <stop offset='0%' stopColor='white' stopOpacity='1' />
          <stop offset='100%' stopColor='white' stopOpacity='0' />
        </radialGradient>
        {/* Accent glow for conversions */}
        <radialGradient id='particle-accent' cx='50%' cy='50%' r='50%'>
          <stop offset='0%' stopColor='var(--color-accent)' stopOpacity='1' />
          <stop
            offset='60%'
            stopColor='var(--color-accent)'
            stopOpacity='0.5'
          />
          <stop offset='100%' stopColor='var(--color-accent)' stopOpacity='0' />
        </radialGradient>
      </defs>
      <AnimatePresence>
        {particles.map(particle => {
          // Only show accent pulse for Jovie (right) side conversions
          const isConverting =
            particle.side === 'right' &&
            particle.state === 'arrived' &&
            particle.convertPulse > 0.1;
          const baseRadius = 3;
          const pulseRadius = isConverting
            ? baseRadius + particle.convertPulse * 8
            : baseRadius;

          return (
            <g key={particle.id}>
              {/* Accent pulse ring on conversion (Jovie side only) */}
              {isConverting && (
                <motion.circle
                  cx={particle.x}
                  cy={particle.y}
                  r={pulseRadius}
                  fill='none'
                  stroke='var(--color-accent)'
                  strokeWidth={2}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: particle.convertPulse * 0.8 }}
                  exit={{ opacity: 0 }}
                />
              )}
              {/* Main particle - white, accent when converting */}
              <motion.circle
                cx={particle.x}
                cy={particle.y}
                r={baseRadius}
                fill={
                  isConverting
                    ? 'url(#particle-accent)'
                    : 'url(#particle-white)'
                }
                initial={{ opacity: 0, scale: 0 }}
                animate={{
                  opacity: particle.opacity,
                  scale: 1,
                }}
                exit={{ opacity: 0, scale: 0 }}
                transition={{ duration: 0.15 }}
              />
            </g>
          );
        })}
      </AnimatePresence>
    </svg>
  );
}

function StaticFlowIndicators() {
  return (
    <div className='absolute inset-0 pointer-events-none flex justify-around items-center'>
      {/* Left side - fork indicator */}
      <div className='flex flex-col items-center'>
        <div className='text-tertiary-token/30 text-xs'>Traffic splits</div>
        <div className='text-tertiary-token/50 text-lg mt-1'>→ → → →</div>
      </div>

      {/* Right side - route indicator */}
      <div className='flex flex-col items-center'>
        <div className='text-tertiary-token/30 text-xs'>Traffic routes</div>
        <div className='text-accent/50 text-lg mt-1'>→</div>
      </div>
    </div>
  );
}
