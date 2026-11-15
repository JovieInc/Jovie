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
      'bg-surface-1/60 backdrop-blur-lg border border-subtle rounded-3xl shadow-xl shadow-black/5',
    glass:
      'bg-surface-1/40 backdrop-blur-md ring-1 ring-subtle rounded-xl shadow-sm',
    solid: 'bg-surface-1 border border-default rounded-xl shadow-lg',
  };

  return (
    <div className='relative min-h-svh bg-surface-1 transition-colors duration-subtle overflow-hidden'>
      {/* Background Pattern */}
      {backgroundPattern !== 'none' && (
        <BackgroundPattern variant={backgroundPattern} />
      )}

      {/* Gradient Blurs */}
      {showGradientBlurs && (
        <>
          <div className='absolute top-1/4 left-1/4 w-96 h-96 bg-gradient-to-r from-accent-blue/10 to-accent-purple/10 dark:from-accent-blue/20 dark:to-accent-purple/20 rounded-full blur-3xl opacity-50' />
          <div className='absolute bottom-1/4 right-1/4 w-96 h-96 bg-gradient-to-r from-accent-purple/10 to-accent-teal/10 dark:from-accent-purple/20 dark:to-accent-teal/20 rounded-full blur-3xl opacity-50' />
        </>
      )}

      {/* Content */}
      <div className='relative z-10 flex min-h-svh flex-col'>
        <div className={cn(variants[variant], className)}>{children}</div>
      </div>
    </div>
  );
}
