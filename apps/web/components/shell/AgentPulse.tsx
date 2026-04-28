import { cn } from '@/lib/utils';

export interface AgentPulseProps {
  /** Override the default ring tone (defaults to the primary token). */
  readonly className?: string;
  /** Override the animation duration in milliseconds. Defaults to 1600ms. */
  readonly durationMs?: number;
}

/**
 * AgentPulse — ambient "agent is working" affordance. Renders an
 * absolutely positioned inset ring that breathes via the global
 * `.anim-calm-breath` utility. Position the parent as `relative` and
 * mount this as a sibling so the ring outlines the affordance without
 * displacing it.
 *
 * The animation auto-disables under `prefers-reduced-motion: reduce`.
 *
 * @example
 * ```tsx
 * <span className='relative inline-flex h-6 w-6'>
 *   <AvatarThumb src={...} />
 *   {agent.isWorking && <AgentPulse />}
 * </span>
 * ```
 */
export function AgentPulse({ className, durationMs = 1600 }: AgentPulseProps) {
  return (
    <span
      aria-hidden='true'
      title='Agent working'
      className={cn(
        'absolute inset-0 ring-1 ring-inset ring-primary-token/40 rounded anim-calm-breath pointer-events-none',
        className
      )}
      style={{ animationDuration: `${durationMs}ms` }}
    />
  );
}
