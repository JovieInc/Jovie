'use client';

import { motion, useReducedMotion } from 'motion/react';

const links = [
  { id: 1, label: 'Stream New Album' },
  { id: 2, label: 'Shop Merch' },
  { id: 3, label: 'Get Tour Tickets' },
];

export function WallOfLinksUI() {
  const reducedMotion = useReducedMotion();

  return (
    <div className='w-full max-w-[320px] mx-auto'>
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
            <div className='w-16 h-16 rounded-full bg-linear-to-br from-blue-500 to-cyan-500' />
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

        {/* Links */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {links.map((link, index) => (
            <motion.div
              key={link.id}
              initial={
                reducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }
              }
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{
                delay: reducedMotion ? 0 : index * 0.05,
                duration: reducedMotion ? 0 : 0.3,
              }}
              className='h-10 px-4 flex items-center justify-center'
              style={{
                backgroundColor: 'var(--linear-bg-surface-2)',
                border: '1px solid var(--linear-border-subtle)',
                borderRadius: 'var(--linear-radius-sm)',
                fontSize: 'var(--linear-body-sm-size)',
                color: 'var(--linear-text-secondary)',
              }}
            >
              {link.label}
            </motion.div>
          ))}

          {/* More links indicator */}
          <div
            className='text-center'
            style={{
              paddingTop: 'var(--linear-space-1)',
              fontSize: 'var(--linear-label-size)',
              color: 'var(--linear-text-tertiary)',
            }}
          >
            + 3 more links
          </div>
        </div>
      </div>
    </div>
  );
}
