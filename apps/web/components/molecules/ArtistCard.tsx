'use client';

import { type MotionProps, motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { Avatar } from '@/components/atoms/Avatar';

// Animation constants for spring physics
const CONTAINER_SPRING_STIFFNESS = 300;
const CONTAINER_SPRING_DAMPING = 20;
const CONTAINER_SPRING_MASS = 0.7;
const AVATAR_SPRING_STIFFNESS = 400;
const AVATAR_SPRING_DAMPING = 17;
const REDUCED_MOTION_DURATION = 0.1;
const NAME_HOVER_DURATION = 0.2;
const NAME_HOVER_OPACITY = 0.8;

export interface ArtistCardProps {
  handle: string;
  name: string;
  src: string;
  alt?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showName?: boolean;
  className?: string;
  isVerified?: boolean;
}

export function ArtistCard({
  handle,
  name,
  src,
  alt,
  size = 'md',
  showName = true,
  className = '',
  isVerified = false,
}: ArtistCardProps) {
  // Check if user prefers reduced motion
  const prefersReducedMotion = useReducedMotion();

  const containerWhileHover: MotionProps['whileHover'] = prefersReducedMotion
    ? { y: -1 }
    : { y: -3 };

  const containerWhileFocus: MotionProps['whileFocus'] = prefersReducedMotion
    ? { y: -1 }
    : { y: -3 };

  const containerTransition: MotionProps['transition'] = prefersReducedMotion
    ? { duration: REDUCED_MOTION_DURATION }
    : {
        type: 'spring',
        stiffness: CONTAINER_SPRING_STIFFNESS,
        damping: CONTAINER_SPRING_DAMPING,
        mass: CONTAINER_SPRING_MASS,
      };

  const avatarWhileHover: MotionProps['whileHover'] = prefersReducedMotion
    ? { boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }
    : {
        boxShadow:
          '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
      };

  const avatarTransition: MotionProps['transition'] = prefersReducedMotion
    ? { duration: REDUCED_MOTION_DURATION }
    : {
        type: 'spring',
        stiffness: AVATAR_SPRING_STIFFNESS,
        damping: AVATAR_SPRING_DAMPING,
      };

  const avatarSize = (
    {
      sm: 'lg',
      md: 'display-md',
      lg: 'display-xl',
      xl: 'display-2xl',
    } as const
  )[size];

  return (
    <motion.div
      initial={{ scale: 1, y: 0 }}
      whileHover={containerWhileHover}
      whileFocus={containerWhileFocus}
      transition={containerTransition}
      className={className}
    >
      <Link
        href={`/${handle}`}
        aria-label={`View ${name}'s profile`}
        title={name}
        className='group block cursor-pointer'
      >
        <div className='text-center'>
          <motion.div
            whileHover={avatarWhileHover}
            transition={avatarTransition}
          >
            <Avatar
              src={src}
              alt={alt ?? name}
              name={name}
              size={avatarSize}
              className='mx-auto'
              verified={isVerified}
            />
          </motion.div>
          {showName && (
            <motion.p
              className={`mt-2 font-medium text-primary-token ${
                size === 'sm' ? 'text-xs' : 'text-sm'
              }`}
              whileHover={{
                opacity: NAME_HOVER_OPACITY,
              }}
              transition={{ duration: NAME_HOVER_DURATION }}
            >
              {name}
            </motion.p>
          )}
        </div>
      </Link>
    </motion.div>
  );
}
