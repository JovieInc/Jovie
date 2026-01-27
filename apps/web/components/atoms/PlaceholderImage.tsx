import { clsx } from 'clsx';
import { forwardRef } from 'react';

interface PlaceholderImageProps {
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  shape?: 'circle' | 'square' | 'rounded';
  className?: string;
  children?: React.ReactNode;
}

const sizeClasses = {
  sm: 'h-8 w-8',
  md: 'h-12 w-12',
  lg: 'h-16 w-16',
  xl: 'h-24 w-24',
  '2xl': 'h-32 w-32',
};

const shapeClasses = {
  circle: 'rounded-full',
  square: 'rounded-none',
  rounded: 'rounded-lg',
};

export const PlaceholderImage = forwardRef<
  HTMLDivElement,
  PlaceholderImageProps
>(({ size = 'md', shape = 'circle', className, children }, ref) => {
  return (
    <div
      ref={ref}
      className={clsx(
        'flex items-center justify-center bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-800',
        sizeClasses[size],
        shapeClasses[shape],
        className
      )}
    >
      {children || (
        // SVG requires role="img" for accessibility; native <img> cannot render inline SVGs
        <svg // NOSONAR S6819
          className='h-1/2 w-1/2 text-gray-400 dark:text-gray-500'
          fill='currentColor'
          viewBox='0 0 24 24'
          role='img'
          aria-label='Default profile picture'
        >
          <path d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z' />
        </svg>
      )}
    </div>
  );
});

PlaceholderImage.displayName = 'PlaceholderImage';
