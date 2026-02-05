'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const typingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const phaseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isVisible, setIsVisible] = useState(true);
  const [phase, setPhase] = useState<Phase>('typing');
  const [typedText, setTypedText] = useState('');

  const emailToType = 'fan@email.com';

  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { threshold: 0.2 }
    );

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      setPhase('listen');
      setTypedText('');
      return;
    }

    if (isVisible) {
      setPhase('typing');
      setTypedText('');
    }
  }, [isVisible, reducedMotion]);

  // Typing animation
  useEffect(() => {
    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current);
      typingIntervalRef.current = null;
    }

    if (phase !== 'typing' || reducedMotion || !isVisible) return;

    let charIndex = 0;
    typingIntervalRef.current = setInterval(() => {
      if (charIndex < emailToType.length) {
        setTypedText(emailToType.slice(0, charIndex + 1));
        charIndex++;
      } else if (typingIntervalRef.current) {
        clearInterval(typingIntervalRef.current);
        typingIntervalRef.current = null;
      }
    }, 100);

    return () => {
      if (typingIntervalRef.current) {
        clearInterval(typingIntervalRef.current);
        typingIntervalRef.current = null;
      }
    };
  }, [phase, reducedMotion, isVisible]);

  // Phase transitions
  useEffect(() => {
    if (phaseTimeoutRef.current) {
      clearTimeout(phaseTimeoutRef.current);
      phaseTimeoutRef.current = null;
    }

    if (reducedMotion || !isVisible) return;

    const currentIndex = phaseOrder.indexOf(phase);
    const nextPhase = phaseOrder[(currentIndex + 1) % phaseOrder.length];
    const duration = phaseConfig[phase].duration;

    phaseTimeoutRef.current = setTimeout(() => {
      if (nextPhase === 'typing') {
        setTypedText('');
      }
      setPhase(nextPhase);
    }, duration);

    return () => {
      if (phaseTimeoutRef.current) {
        clearTimeout(phaseTimeoutRef.current);
        phaseTimeoutRef.current = null;
      }
    };
  }, [phase, reducedMotion, isVisible]);

  const isSubscribed = phase !== 'typing' && phase !== 'subscribing';
  const showCTAButton =
    phase === 'listen' || phase === 'shop' || phase === 'tickets';

  return (
    <div ref={containerRef} className='w-full max-w-[320px] mx-auto'>
      <div
        className='p-6 min-h-[280px]'
        style={{
          backgroundColor: 'var(--linear-bg-surface-1)',
          border: '1px solid var(--linear-border-default)',
          borderRadius: 'var(--linear-radius-lg)',
        }}
      >
        {/* Profile info */}
        <div style={{ marginBottom: 'var(--linear-space-6)' }}>
          <div
            className='flex flex-col items-center'
            style={{ gap: 'var(--linear-space-3)' }}
          >
            <div className='w-16 h-16 rounded-full bg-linear-to-br from-purple-500 to-pink-500' />
            <div
              style={{
                fontSize: 'var(--linear-body-sm-size)',
                fontWeight: 'var(--linear-font-weight-medium)',
                color: 'var(--linear-text-secondary)',
              }}
            >
              @artist
            </div>
          </div>
        </div>

        {/* Dynamic content - fixed height container */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--linear-space-3)',
          }}
        >
          <div className='relative h-[100px]'>
            <AnimatePresence mode='wait'>
              {phase === 'typing' && (
                <motion.div
                  key='input'
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className='absolute inset-0'
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--linear-space-2)',
                  }}
                >
                  {/* Email input */}
                  <div
                    className='h-11 px-4 flex items-center'
                    style={{
                      backgroundColor: 'var(--linear-bg-surface-0)',
                      border: '1px solid var(--linear-border-subtle)',
                      borderRadius: 'var(--linear-radius-sm)',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 'var(--linear-body-sm-size)',
                        color: 'var(--linear-text-primary)',
                      }}
                    >
                      {typedText}
                      <span
                        className='animate-pulse'
                        style={{ color: 'var(--linear-accent-bg)' }}
                      >
                        |
                      </span>
                    </span>
                  </div>
                  {/* Subscribe button */}
                  <button
                    type='button'
                    className='w-full h-11 px-5 hover:opacity-90 transition-opacity'
                    style={{
                      backgroundColor: 'var(--linear-btn-primary-bg)',
                      color: 'var(--linear-btn-primary-fg)',
                      border: '1px solid var(--linear-border-subtle)',
                      borderRadius: 'var(--linear-radius-sm)',
                      fontSize: 'var(--linear-body-sm-size)',
                      fontWeight: 'var(--linear-font-weight-semibold)',
                    }}
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
                  <div
                    style={{
                      fontSize: 'var(--linear-body-sm-size)',
                      color: 'var(--linear-text-secondary)',
                    }}
                  >
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
                    className='w-full h-11 px-5 flex items-center justify-center shadow-sm hover:opacity-90 transition-opacity'
                    style={{
                      backgroundColor: 'var(--linear-btn-primary-bg)',
                      color: 'var(--linear-btn-primary-fg)',
                      border: '1px solid var(--linear-border-subtle)',
                      borderRadius: 'var(--linear-radius-sm)',
                      fontSize: 'var(--linear-body-sm-size)',
                      fontWeight: 'var(--linear-font-weight-semibold)',
                    }}
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
          <div
            className='text-center'
            style={{
              fontSize: 'var(--linear-label-size)',
              color: 'var(--linear-text-tertiary)',
            }}
          >
            {isSubscribed ? 'CTA adapts per visitor' : 'Join the community'}
          </div>
        </div>
      </div>
    </div>
  );
}
