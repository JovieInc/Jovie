'use client';

import { ChevronRight, Link2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Image from 'next/image';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { cn } from '@/lib/utils';
import type { PhoneMockupPreviewProps } from './types';
import { usePhoneMockupPreview } from './usePhoneMockupPreview';
import { getPlatformName } from './utils';

// Animation constants
const LINK_ANIMATION_BASE_DELAY = 0.1;
const LINK_ANIMATION_DELAY_INCREMENT = 0.05;
const LINK_ANIMATION_DURATION = 0.3;
const HOVER_SCALE = 1.02;
const TAP_SCALE = 0.98;
const HOVER_DURATION = 0.2;
const TAP_DURATION = 0.1;

export function PhoneMockupPreview({
  username,
  avatarUrl,
  links,
  className,
}: PhoneMockupPreviewProps) {
  const { isLoaded, activeLink, setActiveLink, visibleLinks } =
    usePhoneMockupPreview(links);

  return (
    <div className={cn('relative', className)}>
      {/* Phone frame - simplified */}
      <div
        className={cn(
          'relative w-full max-w-[300px] mx-auto',
          'aspect-9/19 rounded-[28px]',
          'bg-surface-1 border border-(--linear-app-frame-seam)',
          'overflow-hidden'
        )}
      >
        {/* Phone screen */}
        <div
          className={cn(
            'relative w-full h-full rounded-[24px] overflow-hidden',
            'border border-(--linear-app-frame-seam) bg-surface-0',
            'transition-colors duration-300'
          )}
        >
          {/* Profile header */}
          <div className='relative h-40 bg-linear-to-br from-indigo-500 to-purple-600'>
            <div className='absolute inset-0 bg-linear-to-t from-black/30 to-transparent' />

            <div className='relative z-10 flex flex-col items-center justify-center h-full pt-6 px-6'>
              {/* Avatar */}
              <div
                className={cn(
                  'w-20 h-20 rounded-full mb-3',
                  'border-4 border-white/20',
                  'bg-surface-1',
                  'overflow-hidden',
                  'transition-all duration-300',
                  isLoaded ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
                )}
              >
                {avatarUrl ? (
                  <Image
                    src={avatarUrl}
                    alt={username}
                    fill
                    sizes='80px'
                    className='object-cover'
                  />
                ) : (
                  <div className='w-full h-full flex items-center justify-center bg-surface-2'>
                    <span className='text-2xl font-[590] text-primary-token'>
                      {username.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
              </div>

              {/* Username */}
              <h1
                className={cn(
                  'text-xl font-[590] text-white text-center',
                  'transition-all duration-300',
                  isLoaded
                    ? 'opacity-100 translate-y-0'
                    : 'opacity-0 translate-y-2'
                )}
              >
                @{username}
              </h1>

              {/* Bio */}
              <p
                className={cn(
                  'text-sm text-white/80 text-center mt-1 max-w-xs',
                  'transition-all duration-300 delay-100',
                  isLoaded
                    ? 'opacity-100 translate-y-0'
                    : 'opacity-0 translate-y-2'
                )}
              >
                Tap a link below to visit
              </p>
            </div>
          </div>

          {/* Links list */}
          <div
            className={cn(
              'p-4 space-y-3 h-[calc(100%-10rem)] overflow-y-auto',
              'transition-all duration-300'
            )}
          >
            <AnimatePresence>
              {visibleLinks.length > 0 ? (
                visibleLinks.map((link, index) => (
                  <motion.div
                    key={link.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{
                      opacity: isLoaded ? 1 : 0,
                      y: isLoaded ? 0 : 10,
                      transition: {
                        delay:
                          LINK_ANIMATION_BASE_DELAY +
                          index * LINK_ANIMATION_DELAY_INCREMENT,
                        duration: LINK_ANIMATION_DURATION,
                        ease: 'easeOut',
                      },
                    }}
                    whileHover={{
                      scale: HOVER_SCALE,
                      transition: { duration: HOVER_DURATION },
                    }}
                    whileTap={{
                      scale: TAP_SCALE,
                      transition: { duration: TAP_DURATION },
                    }}
                    onHoverStart={() => setActiveLink(link.id)}
                    onHoverEnd={() => setActiveLink(null)}
                    onClick={event => event.preventDefault()}
                    role='presentation'
                    aria-hidden='true'
                    tabIndex={-1}
                    className={cn(
                      'relative block rounded-[10px] border border-(--linear-app-frame-seam) bg-surface-0 p-4 hover:bg-surface-1',
                      'transition-all duration-200',
                      'overflow-hidden',
                      activeLink === link.id && 'ring-2 ring-primary-500/20'
                    )}
                  >
                    <div className='flex items-center gap-3'>
                      <div
                        className={cn(
                          'shrink-0 w-10 h-10 rounded-[10px]',
                          'flex items-center justify-center',
                          'bg-surface-0',
                          'text-primary-token',
                          'transition-all duration-200'
                        )}
                      >
                        <SocialIcon
                          platform={link.platform}
                          className={cn(
                            'w-5 h-5',
                            link.platform === 'tiktok' &&
                              'text-black dark:text-white'
                          )}
                        />
                      </div>

                      <div className='min-w-0 flex-1'>
                        <h3 className='truncate text-app font-[510] text-primary-token'>
                          {link.title || getPlatformName(link.platform)}
                        </h3>
                        <p className='truncate text-app text-secondary-token'>
                          {link.url
                            .replace(/^https?:\/\//, '')
                            .replace(/\/$/, '')}
                        </p>
                      </div>

                      <div className='shrink-0 text-tertiary-token'>
                        <ChevronRight className='w-4 h-4' aria-hidden='true' />
                      </div>
                    </div>

                    {/* Glow effect on hover */}
                    <div
                      className={cn(
                        'absolute inset-0 -z-10 opacity-0',
                        'bg-linear-to-r from-primary-500/5 to-primary-600/5 dark:from-primary-400/5 dark:to-primary-500/5',
                        'transition-opacity duration-300',
                        activeLink === link.id && 'opacity-100'
                      )}
                      aria-hidden='true'
                    />
                  </motion.div>
                ))
              ) : (
                <div className='h-full flex flex-col items-center justify-center text-center p-6'>
                  <div className='mb-3 flex h-12 w-12 items-center justify-center rounded-[10px] border border-(--linear-app-frame-seam) bg-surface-0'>
                    <Link2
                      className='w-6 h-6 text-tertiary-token'
                      aria-hidden='true'
                    />
                  </div>
                  <h3 className='mb-1 text-app font-[510] text-primary-token'>
                    No links yet
                  </h3>
                  <p className='text-app text-secondary-token'>
                    Add your first link to see it here
                  </p>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
