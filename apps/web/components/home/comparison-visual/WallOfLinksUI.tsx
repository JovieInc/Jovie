'use client';

import { motion, useReducedMotion } from 'motion/react';

const links = [
  { id: 1, label: 'New Album Out Now', emoji: '🎵' },
  { id: 2, label: 'Tour Tickets', emoji: '🎤' },
  { id: 3, label: 'Shop Merch', emoji: '👕' },
  { id: 4, label: 'YouTube', emoji: '▶️' },
  { id: 5, label: 'TikTok', emoji: '📱' },
  { id: 6, label: 'Spotify Playlist', emoji: '🎧' },
];

export function WallOfLinksUI() {
  const reducedMotion = useReducedMotion();

  return (
    <div className='w-full max-w-[320px] mx-auto'>
      <div
        className='relative overflow-hidden'
        style={{
          backgroundColor: 'var(--linear-bg-surface-0)',
          border: '1px solid var(--linear-border-subtle)',
          borderRadius: 'var(--linear-radius-lg)',
          boxShadow: 'var(--linear-shadow-card)',
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
                'linear-gradient(135deg, oklch(50% 0.15 250), oklch(60% 0.15 300))',
              opacity: 0.6,
            }}
          />
          <div
            className='mt-2.5'
            style={{
              fontSize: '14px',
              fontWeight: 510,
              color: 'var(--linear-text-secondary)',
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

        {/* Links - cluttered wall effect */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {links.map((link, index) => (
            <motion.div
              key={link.id}
              initial={
                reducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }
              }
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{
                delay: reducedMotion ? 0 : index * 0.04,
                duration: reducedMotion ? 0 : 0.25,
                ease: [0.25, 0.46, 0.45, 0.94],
              }}
              className='flex items-center justify-center'
              style={{
                height: '40px',
                backgroundColor: 'var(--linear-bg-surface-2)',
                border: '1px solid var(--linear-border-subtle)',
                borderRadius: 'var(--linear-radius-sm)',
                fontSize: '13px',
                fontWeight: 450,
                color: 'var(--linear-text-secondary)',
                gap: '8px',
                letterSpacing: '-0.01em',
              }}
            >
              <span style={{ fontSize: '12px' }}>{link.emoji}</span>
              {link.label}
            </motion.div>
          ))}

          {/* Fade-out overflow indicator */}
          <div
            className='relative flex items-center justify-center'
            style={{
              height: '40px',
              fontSize: '12px',
              color: 'var(--linear-text-tertiary)',
              letterSpacing: '-0.005em',
            }}
          >
            + 4 more links...
          </div>
        </div>

        {/* Subtle red tint overlay to signal "not ideal" */}
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-0 rounded-xl'
          style={{
            background:
              'linear-gradient(180deg, transparent 40%, oklch(60% 0.08 25 / 0.04) 100%)',
          }}
        />
      </div>
    </div>
  );
}
