import { cn } from '@/lib/utils';

interface SpacerProps {
  readonly size?: 'sm' | 'md' | 'lg' | 'xl';
  readonly className?: string;
}

const spacerSizes = {
  sm: 'h-8', // 32px
  md: 'h-12', // 48px
  lg: 'h-16', // 64px
  xl: 'h-24', // 96px
};

export function Spacer({ size = 'md', className }: SpacerProps) {
  return (
    <div className={cn(spacerSizes[size], className)} aria-hidden='true' />
  );
}
