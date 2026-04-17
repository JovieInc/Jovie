'use client';

import { cn } from '@/lib/utils';

interface SegmentedDigitBoxProps {
  readonly digit: string;
  readonly isFocused: boolean;
  readonly error?: boolean;
  readonly disabled?: boolean;
  readonly index: number;
  readonly inputRef: (el: HTMLInputElement | null) => void;
  readonly onInputChange: (index: number, value: string) => void;
  readonly onKeyDown: (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>
  ) => void;
  readonly onInput: (
    index: number,
    e: React.FormEvent<HTMLInputElement>
  ) => void;
  readonly onPaste?: (e: React.ClipboardEvent) => void;
  readonly onFocus: (index: number) => void;
  readonly onBlur: () => void;
  readonly autoComplete?: string;
  readonly ariaLabel: string;
  readonly ariaDescribedBy?: string;
  readonly ariaInvalid?: boolean;
  /** Outer box sizing class (e.g., 'min-h-[48px] w-11 sm:h-[52px] sm:w-12') */
  readonly boxSizeClassName: string;
  /** Inner text sizing class (e.g., 'text-[1.3rem] sm:text-[1.45rem]') */
  readonly textSizeClassName: string;
}

export function SegmentedDigitBox({
  digit,
  isFocused,
  error = false,
  disabled = false,
  index,
  inputRef,
  onInputChange,
  onKeyDown,
  onInput,
  onPaste,
  onFocus,
  onBlur,
  autoComplete = 'off',
  ariaLabel,
  ariaDescribedBy,
  ariaInvalid,
  boxSizeClassName,
  textSizeClassName,
}: SegmentedDigitBoxProps) {
  const isCursor = isFocused && !digit;

  return (
    <div
      className={cn(
        'relative flex items-center justify-center rounded-[18px] border font-[620] tracking-[-0.035em] transition-[border-color,background-color,box-shadow] duration-150',
        boxSizeClassName,
        'border-[color:var(--profile-pearl-border)] bg-[color:color-mix(in_srgb,var(--profile-pearl-bg)_94%,transparent)] text-primary-token shadow-[0_10px_24px_rgba(15,17,24,0.08)] backdrop-blur-2xl',
        isFocused
          ? 'border-[color:var(--profile-pearl-border)] bg-[var(--profile-pearl-bg-hover)] ring-2 ring-[rgb(var(--focus-ring))]/18 shadow-[0_14px_30px_rgba(15,17,24,0.12)]'
          : 'hover:bg-[var(--profile-pearl-bg-hover)]',
        error &&
          'border-red-500/55 bg-[color:color-mix(in_srgb,var(--profile-pearl-bg)_90%,rgba(127,29,29,0.12))] ring-2 ring-red-500/14',
        disabled && 'opacity-50 cursor-not-allowed',
        'active:bg-[var(--profile-pearl-bg-hover)]'
      )}
    >
      <input
        ref={inputRef}
        type='text'
        inputMode='numeric'
        pattern='[0-9]*'
        value={digit}
        onChange={e => onInputChange(index, e.target.value)}
        onKeyDown={e => onKeyDown(index, e)}
        onInput={e => onInput(index, e)}
        onPaste={onPaste}
        onFocus={() => onFocus(index)}
        onBlur={onBlur}
        disabled={disabled}
        autoComplete={autoComplete}
        aria-invalid={ariaInvalid}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        className={cn(
          'absolute inset-0 h-full w-full bg-transparent text-center font-sans',
          textSizeClassName,
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
}
