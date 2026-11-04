import { IconButton } from '@jovie/ui';
import { Repeat } from 'lucide-react';

export type LoopMode = 'off' | 'track' | 'section';

/**
 * LoopBtn — three-state loop toggle.
 *
 * `off` — no loop, dim icon. `track` — loop the active track, "1" badge.
 * `section` — loop the highlighted section between cue markers, ⤴ badge.
 *
 * @example
 * ```tsx
 * const [mode, setMode] = useState<LoopMode>('off');
 * <LoopBtn mode={mode} onClick={() =>
 *   setMode(m => (m === 'off' ? 'track' : m === 'track' ? 'section' : 'off'))
 * } />
 * ```
 */
export function LoopBtn({
  mode,
  onClick,
  className,
}: {
  readonly mode: LoopMode;
  readonly onClick: () => void;
  readonly className?: string;
}) {
  const active = mode !== 'off';
  return (
    <IconButton
      variant='ghost'
      size='sm'
      type='button'
      onClick={onClick}
      className={className}
      aria-label={`Loop: ${mode}`}
      title={`Loop: ${mode}`}
    >
      <Repeat className='h-3.5 w-3.5' strokeWidth={2.25} />
      {mode === 'track' && (
        <span className='absolute -bottom-px right-0 text-3xs font-bold leading-none text-primary-token'>
          1
        </span>
      )}
      {mode === 'section' && (
        <span className='absolute -bottom-px right-0 text-3xs font-bold leading-none text-primary-token'>
          ⤴
        </span>
      )}
      {active && (
        <span className='absolute -top-px left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-primary-token' />
      )}
    </IconButton>
  );
}
