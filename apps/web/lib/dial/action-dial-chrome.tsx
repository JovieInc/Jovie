import type { ReactNode, RefObject } from 'react';
import { DIAL_ICON_OPTICAL_CLASS } from '@/lib/dial/dial-layout';
import { cn } from '@/lib/utils';

export interface DialChromeOption {
  readonly id: string;
  readonly icon?: ReactNode;
}

export function ActionDialIconTrack({
  windowed,
  activeIndex,
  position,
  iconRefs,
}: Readonly<{
  windowed: readonly (readonly [number, DialChromeOption])[];
  activeIndex: number;
  position: number;
  iconRefs: RefObject<Map<number, HTMLElement>>;
}>) {
  return (
    <span
      className='relative h-7 w-7 shrink-0 overflow-hidden [&_svg]:h-7 [&_svg]:w-7'
      aria-hidden='true'
      data-testid='action-dial-icon-track'
    >
      {windowed.map(([index, option]) =>
        Math.abs(index - activeIndex) <= 2 && option.icon ? (
          <span
            key={option.id}
            ref={node => {
              const map = iconRefs.current;
              if (!map) return;
              if (node) map.set(index, node);
              else map.delete(index);
            }}
            className='absolute inset-0 flex items-center justify-center will-change-transform'
            style={{
              transform: `translate3d(0, ${(index - position) * 100}%, 0)`,
              opacity: Math.max(0, 1 - Math.abs(index - position)),
            }}
            data-testid={`action-dial-icon-${option.id}`}
          >
            <span className={DIAL_ICON_OPTICAL_CLASS}>{option.icon}</span>
          </span>
        ) : null
      )}
    </span>
  );
}

export function ActionDialSelectionCue({
  label,
  isPreferred,
  showHint,
  hintGlyphRef,
  multi,
  hintId,
  hint,
}: Readonly<{
  label: string;
  isPreferred: boolean;
  showHint: boolean;
  hintGlyphRef: RefObject<HTMLSpanElement | null>;
  multi: boolean;
  hintId: string;
  hint: string | null;
}>) {
  const caption = (
    <p
      data-testid='action-dial-selection'
      className={cn(
        'text-center text-2xs font-normal text-tertiary-token',
        multi &&
          'transition-opacity duration-normal motion-reduce:transition-none',
        !multi && 'mt-1.5',
        isPreferred ? 'tracking-widest' : 'tracking-tight'
      )}
      aria-hidden={multi ? 'true' : undefined}
    >
      {isPreferred ? 'Remembered' : label}
    </p>
  );
  if (!multi) {
    return hint ? (
      <p id={hintId} className='mt-1 text-center text-xs text-primary-token'>
        {hint}
      </p>
    ) : (
      caption
    );
  }
  return (
    <div className='mt-1.5 flex min-h-5 flex-col items-center justify-center gap-0.5'>
      {caption}
      <div
        className='flex h-4 items-center justify-center'
        aria-hidden='true'
        data-testid='action-dial-hint'
        data-visible={showHint}
      >
        <span
          ref={hintGlyphRef}
          className={cn(
            'text-tertiary-token transition-opacity duration-normal motion-reduce:transition-none',
            showHint ? 'opacity-100' : 'opacity-0'
          )}
        >
          <svg
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth='1.75'
            strokeLinecap='round'
            strokeLinejoin='round'
            className='h-3.5 w-3.5'
            aria-hidden='true'
          >
            <path d='m7 15 5 5 5-5' />
            <path d='m7 9 5-5 5 5' />
          </svg>
        </span>
      </div>
    </div>
  );
}

export function actionDialStreamIcon(
  count: number,
  active: DialChromeOption,
  track: ReactNode
): ReactNode {
  return count < 2 || !active.icon ? active.icon : track;
}
