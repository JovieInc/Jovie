'use client';

import { IconButton } from '@jovie/ui';
import { Star } from 'lucide-react';
import { MAX_RATING } from '@/lib/ovie/lists/model';
import { cn } from '@/lib/utils';

export interface StarRatingProps {
  readonly value: number | null;
  /** Called with the new rating; choosing the current rating clears it. */
  readonly onChange: (rating: number | null) => void;
  readonly label: string;
  readonly disabled?: boolean;
}

const STARS = Array.from({ length: MAX_RATING }, (_, index) => index + 1);

/**
 * 1-5 star rating as pressed buttons. Filled stars carry the value, and each
 * button names its rating, so state is never color-only.
 */
export function StarRating({
  value,
  onChange,
  label,
  disabled = false,
}: StarRatingProps) {
  return (
    <fieldset
      aria-label={label}
      className='m-0 flex items-center border-0 p-0'
      data-testid='star-rating'
    >
      {STARS.map(star => {
        const filled = value !== null && star <= value;
        const pressed = value === star;
        return (
          <IconButton
            key={star}
            size='xs'
            variant='ghost'
            ariaLabel={
              pressed
                ? `Clear ${star}-star rating`
                : `Rate ${star} star${star === 1 ? '' : 's'}`
            }
            aria-pressed={pressed}
            disabled={disabled}
            onClick={() => onChange(pressed ? null : star)}
          >
            <Star
              aria-hidden='true'
              className={cn(
                filled
                  ? 'fill-current text-primary-token'
                  : 'text-quaternary-token'
              )}
            />
          </IconButton>
        );
      })}
    </fieldset>
  );
}
