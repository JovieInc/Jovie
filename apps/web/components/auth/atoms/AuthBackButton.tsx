'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { CircleIconButton } from '@/components/atoms/CircleIconButton';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { cn } from '@/lib/utils';

interface AuthBackButtonProps {
  onClick?: () => void;
  href?: string;
  className?: string;
  ariaLabel?: string;
  /**
   * When true, renders inline instead of fixed positioning.
   * Use this when the button is part of a form flow to prevent overlap.
   */
  inline?: boolean;
}

export function AuthBackButton({
  onClick,
  href,
  className,
  ariaLabel = 'Go back',
  inline = false,
}: Readonly<AuthBackButtonProps>) {
  const haptic = useHapticFeedback();

  // Position classes - fixed by default, relative when inline
  const positionClasses = inline
    ? 'relative'
    : cn(
        'fixed z-50',
        'top-[max(1rem,env(safe-area-inset-top))] left-[max(1rem,env(safe-area-inset-left))]',
        'md:top-6 md:left-6'
      );

  // Responsive sizing - larger on mobile for better touch targets
  const responsiveSizeClasses = 'h-11 w-11 sm:h-10 sm:w-10';

  const handleClick = () => {
    haptic.light();
    onClick?.();
  };

  if (href) {
    return (
      <CircleIconButton
        asChild
        size='md'
        variant='frosted'
        ariaLabel={ariaLabel}
        className={cn(positionClasses, responsiveSizeClasses, className)}
      >
        <Link href={href} onClick={() => haptic.light()}>
          <ArrowLeft />
        </Link>
      </CircleIconButton>
    );
  }

  return (
    <CircleIconButton
      size='md'
      variant='frosted'
      onClick={handleClick}
      ariaLabel={ariaLabel}
      className={cn(positionClasses, responsiveSizeClasses, className)}
    >
      <ArrowLeft />
    </CircleIconButton>
  );
}
