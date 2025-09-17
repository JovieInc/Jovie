'use client';

import { motion, useReducedMotion } from 'framer-motion';
import Image from 'next/image';
import React from 'react';

// import { Button } from './Button'; // Not used in current implementation

interface ArtistCardProps {
  id: string;
  name: string;
  imageUrl?: string;
  popularity?: number;
  followers?: number;
  spotifyUrl?: string;
  isSelected?: boolean;
  onSelect?: () => void;
  className?: string;
}

// Note: id prop is kept for future extensibility

export function ArtistCard({
  id: _id, // eslint-disable-line @typescript-eslint/no-unused-vars
  name,
  imageUrl,
  popularity,
  followers,
  spotifyUrl,
  isSelected = false,
  onSelect,
  className = '',
}: ArtistCardProps) {
  const formatFollowers = (count: number): string => {
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M`;
    }
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
  };

  const getPopularityLabel = (score: number): string => {
    if (score >= 80) return 'Very Popular';
    if (score >= 60) return 'Popular';
    if (score >= 40) return 'Emerging';
    return 'Growing';
  };

  // Check if user prefers reduced motion
  const prefersReducedMotion = useReducedMotion();

  // Adjust animation settings based on motion preference
  const animationProps = prefersReducedMotion
    ? {
        // Minimal animations for reduced motion preference
        whileHover: { boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' },
        whileFocus: { boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' },
        transition: { duration: 0.1 },
      }
    : {
        // Full animations for normal motion preference
        whileHover: {
          scale: 1.02,
          boxShadow:
            '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          borderColor: isSelected ? undefined : 'rgb(209, 213, 219)',
        },
        whileFocus: {
          scale: 1.02,
          boxShadow:
            '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          borderColor: isSelected ? undefined : 'rgb(209, 213, 219)',
        },
        transition: {
          type: 'spring',
          stiffness: 400,
          damping: 17,
          mass: 0.8,
        },
      };

  return (
    <motion.div
      className={`
        relative p-4 rounded-xl border-2 cursor-pointer
        ${
          isSelected
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
        }
        ${className}
      `}
      onClick={onSelect}
      role='button'
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect?.();
        }
      }}
      aria-label={`Select ${name} as your artist profile`}
      aria-pressed={isSelected}
      {...animationProps}
      initial={{ scale: 1, boxShadow: '0 0 0 rgba(0, 0, 0, 0)' }}
    >
      {/* Selection indicator */}
      {isSelected && (
        <div className='absolute top-2 right-2 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center'>
          <svg
            className='w-4 h-4 text-white'
            fill='currentColor'
            viewBox='0 0 20 20'
          >
            <path
              fillRule='evenodd'
              d='M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z'
              clipRule='evenodd'
            />
          </svg>
        </div>
      )}

      <div className='flex items-center space-x-4'>
        {/* Artist image */}
        <div className='w-16 h-16 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700 flex-shrink-0'>
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={name}
              width={64}
              height={64}
              className='w-full h-full object-cover'
            />
          ) : (
            <div className='w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-500'>
              <svg className='w-8 h-8' fill='currentColor' viewBox='0 0 20 20'>
                <path
                  fillRule='evenodd'
                  d='M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-6-3a2 2 0 11-4 0 2 2 0 014 0zm-2 4a5 5 0 00-4.546 2.916A5.986 5.986 0 0010 16a5.986 5.986 0 004.546-2.084A5 5 0 0010 11z'
                  clipRule='evenodd'
                />
              </svg>
            </div>
          )}
        </div>

        {/* Artist info */}
        <div className='flex-1 min-w-0'>
          <h3 className='font-semibold text-gray-900 dark:text-white text-lg truncate'>
            {name}
          </h3>

          <div className='flex items-center space-x-3 mt-1'>
            {followers && (
              <span className='text-sm text-gray-600 dark:text-gray-400'>
                {formatFollowers(followers)} followers
              </span>
            )}

            {popularity && (
              <span
                className={`text-xs px-2 py-1 rounded-full font-medium ${
                  popularity >= 80
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : popularity >= 60
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                      : popularity >= 40
                        ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                        : 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400'
                }`}
              >
                {getPopularityLabel(popularity)}
              </span>
            )}
          </div>

          {/* Spotify link */}
          {spotifyUrl && (
            <div className='mt-2'>
              <a
                href={spotifyUrl}
                target='_blank'
                rel='noopener noreferrer'
                className='text-xs text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 flex items-center space-x-1'
                onClick={e => e.stopPropagation()}
              >
                <svg
                  className='w-3 h-3'
                  viewBox='0 0 24 24'
                  fill='currentColor'
                >
                  <path d='M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.84-.179-.959-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.361 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.559.3z' />
                </svg>
                <span>View on Spotify</span>
              </a>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
