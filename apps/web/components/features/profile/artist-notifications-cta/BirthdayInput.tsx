'use client';

import { useId } from 'react';
import { useSegmentedInput } from '@/hooks/useSegmentedInput';
import { cn } from '@/lib/utils';

const BIRTHDAY_LENGTH = 8;
const GROUPS = [2, 2, 4]; // MM / DD / YYYY

interface BirthdayInputProps {
  readonly value?: string;
  readonly onChange?: (value: string) => void;
  readonly onComplete?: (value: string) => void;
  /** Called when Enter is pressed (regardless of completion) */
  readonly onSubmit?: () => void;
  readonly autoFocus?: boolean;
  readonly disabled?: boolean;
  readonly error?: boolean;
}

const GROUP_LABELS = ['Month', 'Day', 'Year'];

export function BirthdayInput({
  value: controlledValue,
  onChange,
  onComplete,
  onSubmit,
  autoFocus = true,
  disabled = false,
  error = false,
}: BirthdayInputProps) {
  const baseId = useId();

  const {
    focusedIndex,
    inputRefs,
    containerRef,
    handleInputChange,
    handleKeyDown: baseHandleKeyDown,
    handleInput,
    handlePaste,
    handleFocus,
    handleBlur,
    getDigit,
  } = useSegmentedInput({
    length: BIRTHDAY_LENGTH,
    value: controlledValue,
    onChange,
    onComplete,
    autoFocus,
  });

  // Wrap keydown to also handle Enter for submit
  const handleKeyDown = (
    index: number,
    event: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onSubmit?.();
      return;
    }
    baseHandleKeyDown(index, event);
  };

  // Build the grouped layout: [M][M] / [D][D] / [Y][Y][Y][Y]
  // Compute start indices from cumulative group sizes to avoid mutable variable
  const groups = GROUPS.map((size, groupIdx) => {
    const startIndex = GROUPS.slice(0, groupIdx).reduce((a, b) => a + b, 0);
    const digits = Array.from({ length: size }, (_, i) => {
      const idx = startIndex + i;
      return { index: idx, key: `${baseId}-digit-${idx}` };
    });
    return { groupIdx, digits, label: GROUP_LABELS[groupIdx] };
  });

  return (
    <div className='relative' ref={containerRef}>
      <fieldset
        className='flex items-center justify-center gap-1 border-0 p-0 m-0'
        aria-label='Birthday month, day, and year'
        onPaste={handlePaste}
      >
        <legend className='sr-only'>Birthday (MM/DD/YYYY)</legend>
        {groups.map((group, gIdx) => (
          <div key={group.label} className='flex items-center gap-1'>
            {gIdx > 0 && (
              <span
                className='px-0.5 text-[15px] text-secondary-token/40 select-none'
                aria-hidden='true'
              >
                /
              </span>
            )}
            <div className='flex gap-1.5 sm:gap-2'>
              {group.digits.map(({ index, key }) => {
                const digit = getDigit(index);
                const isFocused = focusedIndex === index;
                const isCursor = isFocused && !digit;

                return (
                  <div
                    key={key}
                    className={cn(
                      'relative flex min-h-[44px] w-9 items-center justify-center rounded-[18px] border text-[1.3rem] font-[620] tracking-[-0.035em] transition-[transform,border-color,background-color,box-shadow] duration-150 sm:h-[48px] sm:w-10 sm:text-[1.35rem]',
                      'border-[color:var(--profile-pearl-border)] bg-[var(--profile-pearl-bg)] text-primary-token shadow-[var(--profile-pearl-shadow)] backdrop-blur-xl',
                      isFocused
                        ? 'scale-[1.01] border-[color:var(--profile-pearl-bg-active)] bg-[var(--profile-pearl-bg-active)] ring-2 ring-[rgb(var(--focus-ring))]/20'
                        : 'hover:bg-[var(--profile-pearl-bg-hover)]',
                      error && 'border-red-500/55 ring-2 ring-red-500/12',
                      disabled && 'opacity-50 cursor-not-allowed',
                      'active:scale-[0.985]'
                    )}
                  >
                    <input
                      ref={el => {
                        inputRefs.current[index] = el;
                      }}
                      type='text'
                      inputMode='numeric'
                      pattern='[0-9]*'
                      value={digit}
                      onChange={e => handleInputChange(index, e.target.value)}
                      onKeyDown={e => handleKeyDown(index, e)}
                      onInput={e => handleInput(index, e)}
                      onFocus={() => handleFocus(index)}
                      onBlur={handleBlur}
                      disabled={disabled}
                      autoComplete='off'
                      aria-label={`${group.label} digit ${index - group.digits[0].index + 1}`}
                      className={cn(
                        'absolute inset-0 h-full w-full bg-transparent text-center text-[1.3rem] font-sans sm:text-[1.35rem]',
                        'outline-none border-none',
                        'touch-manipulation [-webkit-tap-highlight-color:transparent]',
                        disabled && 'cursor-not-allowed'
                      )}
                    />

                    {isCursor && (
                      <span
                        className='pointer-events-none animate-pulse text-secondary-token motion-reduce:animate-none'
                        aria-hidden='true'
                      >
                        |
                      </span>
                    )}

                    {digit && (
                      <span
                        className={cn(
                          'pointer-events-none absolute inset-0 flex items-center justify-center',
                          'transition-transform duration-100',
                          'animate-in zoom-in-90 duration-100'
                        )}
                        aria-hidden='true'
                      >
                        {digit}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </fieldset>
    </div>
  );
}
