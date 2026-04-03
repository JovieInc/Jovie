'use client';

import { WandSparkles } from 'lucide-react';
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner';
import { cn } from '@/lib/utils';

interface AlbumArtGenerateButtonProps {
  readonly label: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly isLoading?: boolean;
  readonly variant?: 'primary' | 'secondary';
}

export function AlbumArtGenerateButton({
  label,
  onClick,
  disabled = false,
  isLoading = false,
  variant = 'secondary',
}: AlbumArtGenerateButtonProps) {
  return (
    <button
      type='button'
      onClick={onClick}
      disabled={disabled || isLoading}
      className={cn(
        'inline-flex h-8 items-center justify-center gap-2 rounded-[9px] border px-3 text-[12px] font-[520] transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        variant === 'primary'
          ? 'border-transparent bg-primary-token text-white hover:bg-primary-token/90'
          : 'border-subtle bg-surface-0 text-primary-token hover:bg-surface-1'
      )}
    >
      {isLoading ? (
        <LoadingSpinner size='sm' />
      ) : (
        <WandSparkles className='h-3.5 w-3.5' aria-hidden='true' />
      )}
      <span>{label}</span>
    </button>
  );
}
