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
  { id: 'spotify', label: 'Spotify', bg: '#1DB954', icon: '●' },
  { id: 'apple', label: 'Apple Music', bg: '#FA243C', icon: '●' },
  { id: 'youtube', label: 'YouTube Music', bg: '#FF0000', icon: '●' },
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
        className='relative overflow-hidden'
        style={{
          backgroundColor: 'var(--linear-bg-surface-0)',
          border: '1px solid var(--linear-border-subtle)',
          borderRadius: 'var(--linear-radius-lg)',
          boxShadow: 'var(--linear-shadow-card-elevated)',
          padding: '28px 24px',
          minHeight: '340px',
        }}
      >
        {/* Profile info */}
        <div
          className='flex flex-col items-center'
          style={{ marginBottom: '24px' }}
        >
          <div
            className='w-14 h-14 rounded-full'
            style={{
              background:
                'linear-gradient(135deg, oklch(65% 0.2 270), oklch(70% 0.18 320))',
            }}
          />
          <div
            className='mt-2.5'
            style={{
              fontSize: '14px',
              fontWeight: 510,
              color: 'var(--linear-text-primary)',
              letterSpacing: '-0.01em',
            }}
          >
            @artist
          </div>
          <div
            className='mt-1'
            style={{
              fontSize: '12px',
              color: 'var(--linear-text-tertiary)',
              letterSpacing: '-0.005em',
            }}
          >
            Singer / Songwriter
          </div>
        </div>

        {/* Dynamic content - fixed height container */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
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
                    gap: '8px',
                  }}
                >
                  {/* Email input */}
                  <div
                    className='h-10 px-3.5 flex items-center'
                    style={{
                      backgroundColor: 'var(--linear-bg-surface-2)',
                      border: '1px solid var(--linear-border-default)',
                      borderRadius: '6px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '13px',
                        color: 'var(--linear-text-primary)',
                        letterSpacing: '-0.01em',
                      }}
                    >
                      {typedText}
                      <span
                        className='animate-pulse'
                        style={{ color: 'var(--linear-accent)' }}
                      >
                        |
                      </span>
                    </span>
                  </div>
                  {/* Subscribe button */}
                  <button
                    type='button'
                    className='w-full h-10 px-5 transition-colors'
                    style={{
                      backgroundColor: 'var(--linear-btn-primary-bg)',
                      color: 'var(--linear-btn-primary-fg)',
                      borderRadius: 'var(--linear-radius-sm)',
                      fontSize: '13px',
                      fontWeight: 510,
                      letterSpacing: '-0.01em',
                      border: 'none',
                    }}
                  >
                    Subscribe
                  </button>
                </motion.div>
              )}

              {phase === 'subscribing' && (
                <motion.div
                  key='subscribing'
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                  className='absolute inset-0 flex items-center justify-center'
                >
                  <div className='flex items-center gap-2'>
                    <div
                      className='w-4 h-4 rounded-full border-2 border-t-transparent animate-spin motion-reduce:animate-none'
                      style={{
                        borderColor: 'var(--linear-accent)',
                        borderTopColor: 'transparent',
                      }}
                    />
                    <span
                      style={{
                        fontSize: '13px',
                        fontWeight: 450,
                        color: 'var(--linear-text-secondary)',
                        letterSpacing: '-0.01em',
                      }}
                    >
                      Subscribing...
                    </span>
                  </div>
                </motion.div>
              )}

              {showCTAButton && (
                <motion.div
                  key={phase}
                  initial={
                    reducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }
                  }
                  animate={{ opacity: 1, y: 0 }}
                  exit={reducedMotion ? { opacity: 1 } : { opacity: 0, y: -6 }}
                  transition={{
                    duration: 0.25,
                    ease: [0.25, 0.46, 0.45, 0.94],
                  }}
                  className='absolute inset-0 flex items-center'
                >
                  <button
                    type='button'
                    className='w-full h-10 px-5 flex items-center justify-center transition-colors'
                    style={{
                      backgroundColor: 'var(--linear-btn-primary-bg)',
                      color: 'var(--linear-btn-primary-fg)',
                      borderRadius: 'var(--linear-radius-sm)',
                      fontSize: '13px',
                      fontWeight: 510,
                      letterSpacing: '-0.01em',
                      border: 'none',
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
                          : { opacity: 0, x: -8 }
                      }
                      animate={{ opacity: 1, x: 0 }}
                      transition={{
                        delay: reducedMotion ? 0 : index * 0.12,
                        duration: 0.2,
                        ease: [0.25, 0.46, 0.45, 0.94],
                      }}
                      className='w-full h-8 px-4 flex items-center justify-center text-white'
                      style={{
                        backgroundColor: dsp.bg,
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 510,
                        letterSpacing: '-0.005em',
                        border: 'none',
                      }}
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
              fontSize: '12px',
              color: 'var(--linear-text-tertiary)',
              letterSpacing: '-0.005em',
            }}
          >
            {isSubscribed ? 'CTA adapts per visitor' : 'Join the community'}
          </div>
        </div>

        {/* Subtle green tint overlay to signal "good" */}
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-0 rounded-xl'
          style={{
            background:
              'linear-gradient(180deg, transparent 50%, oklch(72% 0.08 145 / 0.03) 100%)',
          }}
        />
      </div>
    </div>
  );
}
