'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';

type Phase =
  | 'typing'
  | 'subscribing'
  | 'listen'
  | 'listen-dsp'
  | 'shop'
  | 'tickets';

const phaseConfig = {
  typing: { duration: 2500 },
  subscribing: { duration: 800 },
  listen: { duration: 1500 },
  'listen-dsp': { duration: 2500 },
  shop: { duration: 2500 },
  tickets: { duration: 2500 },
};

const phaseOrder: Phase[] = [
  'typing',
  'subscribing',
  'listen',
  'listen-dsp',
  'shop',
  'tickets',
];

const dspLinks = [
  { id: 'spotify', label: 'Spotify', color: 'bg-[#1DB954]' },
  { id: 'apple', label: 'Apple Music', color: 'bg-[#FA243C]' },
  { id: 'youtube', label: 'YouTube Music', color: 'bg-[#FF0000]' },
];

const CTA_BUTTON_LABELS: Record<string, string> = {
  listen: 'Listen Now',
  shop: 'Shop Merch',
  tickets: 'Get Tickets',
};

export function JovieProfileUI() {
  const reducedMotion = useReducedMotion();
  const [phase, setPhase] = useState<Phase>('typing');
  const [typedText, setTypedText] = useState('');

  const emailToType = 'fan@email.com';

  // Typing animation
  useEffect(() => {
    if (phase !== 'typing' || reducedMotion) return;

    let charIndex = 0;
    const typeInterval = setInterval(() => {
      if (charIndex < emailToType.length) {
        setTypedText(emailToType.slice(0, charIndex + 1));
        charIndex++;
      } else {
        clearInterval(typeInterval);
      }
    }, 100);

    return () => clearInterval(typeInterval);
  }, [phase, reducedMotion]);

  // Phase transitions
  useEffect(() => {
    if (reducedMotion) {
      setPhase('listen');
      return;
    }

    const currentIndex = phaseOrder.indexOf(phase);
    const nextPhase = phaseOrder[(currentIndex + 1) % phaseOrder.length];
    const duration = phaseConfig[phase].duration;

    const timeout = setTimeout(() => {
      if (nextPhase === 'typing') {
        setTypedText('');
      }
      setPhase(nextPhase);
    }, duration);

    return () => clearTimeout(timeout);
  }, [phase, reducedMotion]);

  const isSubscribed = phase !== 'typing' && phase !== 'subscribing';
  const showCTAButton =
    phase === 'listen' || phase === 'shop' || phase === 'tickets';

  return (
    <div className='w-full max-w-[320px] mx-auto'>
      <div className='p-6 rounded-2xl bg-surface-1/50 border border-default min-h-[280px]'>
        {/* Profile info */}
        <div className='mb-6'>
          <div className='flex flex-col items-center gap-3'>
            <div className='w-16 h-16 rounded-full bg-linear-to-br from-purple-500 to-pink-500' />
            <div className='text-sm font-medium text-secondary-token'>
              @artist
            </div>
          </div>
        </div>

        {/* Dynamic content - fixed height container */}
        <div className='space-y-3'>
          <div className='relative h-[100px]'>
            <AnimatePresence mode='wait'>
              {phase === 'typing' && (
                <motion.div
                  key='input'
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className='absolute inset-0 space-y-2'
                >
                  {/* Email input */}
                  <div className='h-11 px-4 rounded-lg bg-surface-0 border border-subtle flex items-center'>
                    <span className='text-sm text-primary-token'>
                      {typedText}
                      <span className='animate-pulse text-accent'>|</span>
                    </span>
                  </div>
                  {/* Subscribe button */}
                  <button
                    type='button'
                    className='w-full h-11 px-5 rounded-lg bg-btn-primary text-btn-primary-foreground border border-subtle text-sm font-semibold hover:opacity-90 transition-colors'
                  >
                    Subscribe
                  </button>
                </motion.div>
              )}

              {phase === 'subscribing' && (
                <motion.div
                  key='subscribing'
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className='absolute inset-0 flex items-center justify-center'
                >
                  <div className='text-sm text-secondary-token'>
                    Subscribing...
                  </div>
                </motion.div>
              )}

              {showCTAButton && (
                <motion.div
                  key={phase}
                  initial={
                    reducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }
                  }
                  animate={{ opacity: 1, y: 0 }}
                  exit={reducedMotion ? { opacity: 1 } : { opacity: 0, y: -8 }}
                  transition={{ duration: 0.3 }}
                  className='absolute inset-0 flex items-center'
                >
                  <button
                    type='button'
                    className='w-full h-11 px-5 rounded-lg flex items-center justify-center text-sm font-semibold shadow-sm transition-colors bg-btn-primary text-btn-primary-foreground border border-subtle hover:opacity-90'
                  >
                    {CTA_BUTTON_LABELS[phase]}
                  </button>
                </motion.div>
              )}

              {phase === 'listen-dsp' && (
                <motion.div
                  key='listen-dsp'
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className='absolute inset-0 flex flex-col gap-2'
                >
                  {dspLinks.map((dsp, index) => (
                    <motion.button
                      key={dsp.id}
                      type='button'
                      initial={
                        reducedMotion
                          ? { opacity: 1, x: 0 }
                          : { opacity: 0, x: -10 }
                      }
                      animate={{ opacity: 1, x: 0 }}
                      transition={{
                        delay: reducedMotion ? 0 : index * 0.15,
                        duration: 0.2,
                      }}
                      className={`w-full h-8 px-4 rounded-lg ${dsp.color} text-white flex items-center justify-center text-xs font-medium`}
                    >
                      {dsp.label}
                    </motion.button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Supporting text */}
          <div className='text-center text-xs text-tertiary-token'>
            {isSubscribed ? 'CTA adapts per visitor' : 'Join the community'}
          </div>
        </div>
      </div>
    </div>
  );
}
