'use client';

import { motion, useReducedMotion } from 'framer-motion';
import Link from 'next/link';
import { ArtistAvatar } from '@/components/atoms/ArtistAvatar';

export interface ArtistCardProps {
  handle: string;
  name: string;
  src: string;
  alt?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showName?: boolean;
  className?: string;
}

export function ArtistCard({
  handle,
  name,
  src,
  alt,
  size = 'md',
  showName = true,
  className = '',
}: ArtistCardProps) {
  // Check if user prefers reduced motion
  const prefersReducedMotion = useReducedMotion();

  // Adjust animation settings based on motion preference
  const containerAnimationProps = prefersReducedMotion
    ? {
        // Minimal animations for reduced motion preference
        whileHover: { y: -1 },
        whileFocus: { y: -1 },
        transition: { duration: 0.1 },
      }
    : {
        // Full animations for normal motion preference - more subtle lift
        whileHover: { y: -3 },
        whileFocus: { y: -3 },
        transition: {
          type: 'spring',
          stiffness: 300,
          damping: 20,
          mass: 0.7,
        },
      };

  // Avatar animation props
  const avatarAnimationProps = prefersReducedMotion
    ? {
        whileHover: { boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' },
        transition: { duration: 0.1 },
      }
    : {
        whileHover: {
          boxShadow:
            '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        },
        transition: { type: 'spring', stiffness: 400, damping: 17 },
      };

  return (
    <motion.div
      {...containerAnimationProps}
      initial={{ scale: 1, y: 0 }}
      className={className}
    >
      <Link
        href={`/${handle}`}
        aria-label={`View ${name}'s profile`}
        title={name}
        className='group block cursor-pointer'
      >
        <div className='text-center'>
          <motion.div {...avatarAnimationProps}>
            <ArtistAvatar
              src={src}
              alt={alt ?? name}
              name={name}
              size={size}
              className='mx-auto'
            />
          </motion.div>
          {showName && (
            <motion.p
              className={`mt-2 font-medium text-gray-700 dark:text-gray-300 ${
                size === 'sm' ? 'text-xs' : 'text-sm'
              }`}
              whileHover={{
                opacity: 0.8,
              }}
              transition={{ duration: 0.2 }}
            >
              {name}
            </motion.p>
          )}
        </div>
      </Link>
    </motion.div>
  );
}
