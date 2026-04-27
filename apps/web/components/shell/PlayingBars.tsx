import { cn } from '@/lib/utils';

export interface PlayingBarsProps {
  readonly className?: string;
  /** Accessibility label override. Defaults to 'Now playing'. */
  readonly label?: string;
}

/**
 * PlayingBars — three-bar EQ "now playing" indicator. Calmer than a
 * standard pulsing dot: a tighter amplitude range (40 – 85% height) and
 * slower keyframe durations so the indicator reads as motion without
 * strobing in the user's peripheral vision.
 *
 * Mount inside a positioned parent — the container is
 * `position: absolute; inset: 0` and grid-centers the three bars.
 *
 * Animations live in `app/globals.css` (`@keyframes pb-eq-a/b/c`) so
 * multiple instances share a single keyframe definition rather than each
 * injecting its own `<style>` node.
 */
export function PlayingBars({
  className,
  label = 'Now playing',
}: PlayingBarsProps) {
  return (
    <span
      role='img'
      aria-label={label}
      className={cn('absolute inset-0 grid place-items-center', className)}
    >
      <span className='flex items-end gap-[2px] h-3'>
        <span
          className='w-[2px] rounded-sm bg-primary-token'
          style={{
            animation: 'pb-eq-a 1400ms ease-in-out infinite',
            willChange: 'height',
          }}
        />
        <span
          className='w-[2px] rounded-sm bg-primary-token'
          style={{
            animation: 'pb-eq-b 1100ms ease-in-out infinite',
            animationDelay: '-220ms',
            willChange: 'height',
          }}
        />
        <span
          className='w-[2px] rounded-sm bg-primary-token'
          style={{
            animation: 'pb-eq-c 1700ms ease-in-out infinite',
            animationDelay: '-480ms',
            willChange: 'height',
          }}
        />
      </span>
    </span>
  );
}
