import { cn } from '@/lib/utils';

interface JovieIconProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function JovieIcon({ className = '', size = 'md' }: JovieIconProps) {
  const sizeClasses = {
    sm: 'h-5 w-5',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
  };

  return (
    <div
      className={cn(
        'flex items-center justify-center w-full h-full',
        className
      )}
    >
      <div
        className={cn(
          'flex items-center justify-center rounded-lg',
          'transition-all duration-200',
          'bg-primary-50 dark:bg-primary-900/30',
          'p-2',
          'group-hover:bg-primary-100 dark:group-hover:bg-primary-800/50',
          sizeClasses[size]
        )}
      >
        <svg
          className={cn(
            'transition-all duration-200',
            'text-primary-600 dark:text-primary-400',
            'group-hover:text-primary-700 dark:group-hover:text-primary-300',
            'w-full h-full'
          )}
          viewBox='0 0 24 24'
          fill='currentColor'
          xmlns='http://www.w3.org/2000/svg'
        >
          <path
            fillRule='evenodd'
            clipRule='evenodd'
            d='M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22ZM12 15C14.5 15 16.5 22 12 22C7.5 22 9.5 15 12 15Z'
          />
        </svg>
      </div>
    </div>
  );
}
