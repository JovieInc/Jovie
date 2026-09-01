'use client';

import { ComboboxOption as HeadlessComboboxOption } from '@headlessui/react';
import {
  MENU_ITEM_BASE,
  MENU_ITEM_SELECTED,
} from '@jovie/ui';
import { Check } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { getInitials } from '@/lib/utils/initials';
import type { ComboboxOption } from './types';

interface ComboboxOptionItemProps {
  readonly option: ComboboxOption;
  readonly index: number;
}

/** Option image with loading shimmer and error fallback */
function OptionImage({
  imageUrl,
  name,
}: {
  readonly imageUrl?: string;
  readonly name: string;
}) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setIsLoaded(false);
    setHasError(false);
  }, [imageUrl]);

  if (!imageUrl || hasError) {
    return (
      <div
        className='h-8 w-8 rounded-full bg-surface-2 flex-shrink-0 flex items-center justify-center'
        aria-hidden='true'
      >
        <span className='text-3xs font-medium text-secondary-token select-none leading-none'>
          {getInitials(name)}
        </span>
      </div>
    );
  }

  return (
    <div className='h-8 w-8 rounded-full overflow-hidden flex-shrink-0 relative bg-surface-3'>
      <Image
        src={imageUrl}
        alt=''
        width={32}
        height={32}
        sizes='32px'
        className={cn(
          'h-8 w-8 rounded-full object-cover transition-opacity duration-subtle',
          isLoaded ? 'opacity-100' : 'opacity-0'
        )}
        loading='lazy'
        aria-hidden='true'
        onLoad={() => setIsLoaded(true)}
        onError={() => setHasError(true)}
      />
      {!isLoaded && (
        <div
          className='absolute inset-0 rounded-full skeleton'
          aria-hidden='true'
        />
      )}
    </div>
  );
}

export function ComboboxOptionItem({ option, index }: ComboboxOptionItemProps) {
  return (
    <HeadlessComboboxOption
      className={({ focus, selected }) =>
        cn(
          MENU_ITEM_BASE,
          'w-full pr-8',
          (focus || selected) && MENU_ITEM_SELECTED
        )
      }
      value={option}
      data-index={index}
      id={`option-${option.id}`}
    >
      {({ selected }) => (
        <div className='flex min-w-0 flex-1 items-center gap-3'>
          <OptionImage imageUrl={option.imageUrl} name={option.name} />
          <span className='truncate text-app font-normal'>{option.name}</span>
          {selected && (
            <span
              className='absolute inset-y-0 right-2 flex items-center justify-center text-primary-token'
              aria-hidden='true'
              data-testid='combobox-option-selected-indicator'
            >
              <Check className='h-4 w-4' aria-hidden='true' />
            </span>
          )}
        </div>
      )}
    </HeadlessComboboxOption>
  );
}
