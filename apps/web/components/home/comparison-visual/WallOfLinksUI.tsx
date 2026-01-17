'use client';

import { motion, useReducedMotion } from 'framer-motion';

const links = [
  { id: 1, label: 'Stream New Album' },
  { id: 2, label: 'Shop Merch' },
  { id: 3, label: 'Get Tour Tickets' },
];

export function WallOfLinksUI() {
  const reducedMotion = useReducedMotion();

  return (
    <div className='w-full max-w-[320px] mx-auto'>
      <div className='p-6 rounded-2xl bg-surface-1/50 border border-default min-h-[280px]'>
        {/* Profile info */}
        <div className='mb-6'>
          <div className='flex flex-col items-center gap-3'>
            <div className='w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500' />
            <div className='text-sm font-medium text-secondary-token'>
              @artist
            </div>
          </div>
        </div>

        {/* Links */}
        <div className='space-y-2.5'>
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
              className='h-10 px-4 rounded-lg bg-surface-2/50 border border-subtle flex items-center justify-center text-sm text-secondary-token'
            >
              {link.label}
            </motion.div>
          ))}

          {/* More links indicator */}
          <div className='pt-1 text-center text-xs text-tertiary-token'>
            + 3 more links
          </div>
        </div>
      </div>
    </div>
  );
}
