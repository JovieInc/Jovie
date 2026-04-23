'use client';

import { useId } from 'react';
import { SegmentedDigitBox } from '@/components/atoms/SegmentedDigitBox';
import { useSegmentedInput } from '@/hooks/useSegmentedInput';

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
                className='px-0.5 text-mid text-secondary-token/40 select-none'
                aria-hidden='true'
              >
                /
              </span>
            )}
            <div className='flex gap-1.5 sm:gap-2'>
              {group.digits.map(({ index, key }) => (
                <SegmentedDigitBox
                  key={key}
                  digit={getDigit(index)}
                  isFocused={focusedIndex === index}
                  error={error}
                  disabled={disabled}
                  index={index}
                  inputRef={el => {
                    inputRefs.current[index] = el;
                  }}
                  onInputChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  onInput={handleInput}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                  ariaLabel={`${group.label} digit ${index - group.digits[0].index + 1}`}
                  boxSizeClassName='min-h-[44px] w-9 text-[1.3rem] sm:h-[48px] sm:w-10 sm:text-[1.35rem]'
                  textSizeClassName='text-[1.3rem] sm:text-[1.35rem]'
                />
              ))}
            </div>
          </div>
        ))}
      </fieldset>
    </div>
  );
}
