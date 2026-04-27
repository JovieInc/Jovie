import { Mic } from 'lucide-react';

// Cinematic ease — same curve used across the shell for layout-revealing
// transitions. Inlined here so this leaf has no cross-file dependency.
const EASE_CINEMATIC = 'cubic-bezier(0.32, 0.72, 0, 1)';

/**
 * JovieOverlay — push-to-talk listening overlay.
 *
 * Full-screen modal-ish overlay that surfaces while the user is dictating
 * (hold `⌘J`). Dim backdrop, glassy panel pinned 7rem from the bottom, with
 * a 32-bar live waveform animating from staggered CSS keyframes. When
 * `listening` is false, the overlay collapses + fades out without unmounting,
 * so toggling is symmetric.
 *
 * Pure leaf — owns no state. The caller controls the `listening` flag.
 *
 * @example
 * ```tsx
 * const [listening, setListening] = useState(false);
 * useGlobalKeydown('Meta+j', () => setListening(true));
 * useGlobalKeyup('Meta+j', () => setListening(false));
 * return <JovieOverlay listening={listening} />;
 * ```
 */
export function JovieOverlay({
  listening,
  className,
}: {
  listening: boolean;
  className?: string;
}) {
  return (
    <>
      {/* Backdrop dim — fades the entire shell when dictating so
          the waveform owns the moment. Click to dismiss handled by the
          caller via setListening(false). */}
      <div
        aria-hidden='true'
        className='fixed inset-0 z-40 bg-black pointer-events-none'
        style={{
          opacity: listening ? 0.55 : 0,
          backdropFilter: listening ? 'blur(2px)' : 'blur(0)',
          transition: `opacity 350ms ${EASE_CINEMATIC}, backdrop-filter 350ms ${EASE_CINEMATIC}`,
        }}
      />

      <div
        aria-hidden={!listening}
        className={
          className ??
          'fixed inset-x-0 bottom-28 z-50 flex justify-center pointer-events-none px-6'
        }
        style={{
          opacity: listening ? 1 : 0,
          transform: listening
            ? 'translateY(0) scale(1)'
            : 'translateY(16px) scale(0.96)',
          transition: `opacity 350ms ${EASE_CINEMATIC}, transform 350ms ${EASE_CINEMATIC}`,
        }}
      >
        <div className='pointer-events-auto rounded-3xl backdrop-blur-2xl bg-(--linear-app-content-surface)/90 border border-(--linear-app-shell-border) shadow-[0_24px_72px_rgba(0,0,0,0.45)] px-6 py-5 flex flex-col items-center gap-4 w-[480px] max-w-full'>
          <div className='flex items-center gap-3 self-start'>
            <span className='relative h-8 w-8 rounded-full bg-primary text-on-primary grid place-items-center'>
              <Mic className='h-3.5 w-3.5' strokeWidth={2.5} />
              <span
                aria-hidden='true'
                className='absolute inset-0 rounded-full ring-2 ring-primary/40 anim-calm-halo'
              />
            </span>
            <div className='flex-1 min-w-0'>
              <div className='text-[14px] font-semibold text-primary-token leading-tight'>
                Listening
              </div>
              <div className='text-[11.5px] text-tertiary-token leading-tight mt-0.5'>
                &ldquo;play Take Me Over&rdquo; · &ldquo;find the extended
                mix&rdquo;
              </div>
            </div>
            <kbd className='text-[10px] text-quaternary-token tabular-nums shrink-0'>
              hold ⌘J
            </kbd>
          </div>
          <DictationWaveform active={listening} />
        </div>
      </div>
    </>
  );
}

// 32-bar live waveform driven by staggered CSS keyframes so the
// envelope reads as organic speech. Bars only animate when active
// (paused otherwise) so the component costs nothing at rest.
function DictationWaveform({ active }: { active: boolean }) {
  const BARS = 32;
  return (
    <>
      <style>{`
        @keyframes dict-bar {
          0%, 100% { transform: scaleY(0.18); }
          25%      { transform: scaleY(0.62); }
          50%      { transform: scaleY(1); }
          75%      { transform: scaleY(0.42); }
        }
      `}</style>
      <div
        className='flex items-center justify-center gap-[3px] h-12 w-full'
        aria-hidden='true'
      >
        {Array.from({ length: BARS }, (_, i) => {
          // Deterministic per-bar duration / phase. Mid-strip bars
          // reach taller — gives the strip a soft envelope.
          const center = (BARS - 1) / 2;
          const distance = Math.abs(i - center) / center;
          const baseHeight = 32 + (1 - distance) * 16;
          const duration = 720 + (i % 7) * 80;
          const delay = (i * 47) % 600;
          return (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: deterministic 32-bar list with stable indices — index is the canonical identity
              key={i}
              className='block w-[3px] rounded-full bg-cyan-300/85'
              style={{
                height: baseHeight,
                transformOrigin: 'center',
                animation: active
                  ? `dict-bar ${duration}ms cubic-bezier(0.4, 0, 0.6, 1) ${delay}ms infinite`
                  : 'none',
                opacity: active ? 1 : 0.4,
                transition: `opacity 350ms ${EASE_CINEMATIC}`,
              }}
            />
          );
        })}
      </div>
    </>
  );
}
