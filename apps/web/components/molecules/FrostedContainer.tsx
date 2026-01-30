import { BackgroundPattern } from '@/components/atoms/BackgroundPattern';
import { cn } from '@/lib/utils';

interface FrostedContainerProps {
  readonly children: React.ReactNode;
  readonly variant?: 'default' | 'glass' | 'solid';
  readonly backgroundPattern?: 'grid' | 'dots' | 'gradient' | 'none';
  readonly showGradientBlurs?: boolean;
  readonly className?: string;
}

export function FrostedContainer({
  children,
  variant = 'default',
  backgroundPattern = 'grid',
  showGradientBlurs = true,
  className = '',
}: FrostedContainerProps) {
  const variants = {
    default:
      'bg-white/60 dark:bg-white/5 backdrop-blur-lg border border-gray-200/30 dark:border-white/10 rounded-3xl shadow-xl shadow-black/5',
    glass:
      'bg-white/40 dark:bg-white/5 backdrop-blur-md ring-1 ring-black/5 dark:ring-white/10 rounded-xl shadow-sm',
    solid:
      'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg',
  };

  return (
    <div className='relative min-h-screen bg-white dark:bg-gray-900 transition-colors duration-200 overflow-hidden'>
      {/* Background Pattern */}
      {backgroundPattern !== 'none' && (
        <BackgroundPattern variant={backgroundPattern} />
      )}

      {/* Gradient Blurs */}
      {showGradientBlurs && (
        <>
          <div className='absolute top-1/4 left-1/4 w-96 h-96 bg-gradient-to-r from-blue-400/10 to-purple-400/10 dark:from-blue-400/20 dark:to-purple-400/20 rounded-full blur-3xl opacity-50' />
          <div className='absolute bottom-1/4 right-1/4 w-96 h-96 bg-gradient-to-r from-purple-400/10 to-cyan-400/10 dark:from-purple-400/20 dark:to-cyan-400/20 rounded-full blur-3xl opacity-50' />
        </>
      )}

      {/* Content */}
      <div className='relative z-10 flex min-h-screen flex-col'>
        <div className={cn(variants[variant], className)}>{children}</div>
      </div>
    </div>
  );
}
