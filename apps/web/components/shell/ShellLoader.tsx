import { JovieMarkElectric } from '@/components/atoms/JovieMarkElectric';
import { cn } from '@/lib/utils';

// Cinematic ease — same curve used across the shell for layout-revealing
// transitions. Imported here as a literal so this leaf has no cross-file
// dependency.
const EASE_CINEMATIC = 'var(--ease-drawer)';

export type ShellLoaderPhase = 'bloom' | 'reveal' | 'done';

/**
 * ShellLoader — full-screen cold-start bloom.
 *
 * Pinned overlay that holds the Jovie mark centered on a black canvas, then
 * fades + scales up subtly when `phase` flips to `reveal` so the app emerges
 * underneath. `phase === 'done'` returns null. Pointer-events disabled
 * throughout so the first interaction lands on the real app, not the overlay.
 *
 * Note: this is a leaf — no hooks, no state. Phase is owned by the caller.
 *
 * @example
 * ```tsx
 * const [phase, setPhase] = useState<ShellLoaderPhase>('bloom');
 * useEffect(() => {
 *   const t1 = setTimeout(() => setPhase('reveal'), 600);
 *   const t2 = setTimeout(() => setPhase('done'), 1100);
 *   return () => { clearTimeout(t1); clearTimeout(t2); };
 * }, []);
 * return <ShellLoader phase={phase} />;
 * ```
 */
export function ShellLoader({
  phase,
  className,
}: {
  phase: ShellLoaderPhase;
  className?: string;
}) {
  if (phase === 'done') return null;
  const isReveal = phase === 'reveal';
  return (
    <div
      aria-hidden='true'
      className={cn(
        'fixed inset-0 z-[60] pointer-events-none grid place-items-center',
        className
      )}
      style={{
        backgroundColor: isReveal ? 'rgba(6,7,10,0)' : 'rgba(6,7,10,1)',
        transition: `background-color var(--ds-motion-cinematic-duration) ${EASE_CINEMATIC}`,
      }}
    >
      <div
        style={{
          transform: isReveal ? 'scale(1.08)' : 'scale(1)',
          opacity: isReveal ? 0 : 1,
          transition: `transform var(--ds-motion-cinematic-duration) ${EASE_CINEMATIC}, opacity var(--ds-motion-cinematic-duration) ${EASE_CINEMATIC}`,
        }}
      >
        <JovieMarkElectric size={48} spark={!isReveal} />
      </div>
    </div>
  );
}
