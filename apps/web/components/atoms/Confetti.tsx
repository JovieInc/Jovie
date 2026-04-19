'use client';

/* ------------------------------------------------------------------ */
/*  Shared confetti animation system                                  */
/*                                                                    */
/*  Used by: ProfileLiveCelebration, CheckoutSuccessPage,             */
/*           FirstFanCelebration                                      */
/* ------------------------------------------------------------------ */

const DEFAULT_COUNT = 40;
const DEFAULT_COLORS = [
  'var(--color-accent)',
  'var(--color-success)',
  'var(--color-warning)',
  'var(--color-info)',
  'var(--color-accent-blue)',
];

export interface ConfettiParticle {
  id: string;
  width: number;
  height: number;
  color: string;
  left: string;
  opacity: number;
  animationDelay: string;
  animationDuration: string;
  rotation: string;
}

function getSeededValue(index: number, salt: number): number {
  const seed = ((index + 1) * 1664525 + salt * 1013904223) >>> 0;
  return seed / 0x100000000;
}

export function generateParticles(
  count = DEFAULT_COUNT,
  colors = DEFAULT_COLORS
): ConfettiParticle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `confetti-${i}`,
    width: 4 + getSeededValue(i, 1) * 6,
    height: 4 + getSeededValue(i, 2) * 6,
    color: colors[i % colors.length],
    left: `${getSeededValue(i, 3) * 100}%`,
    opacity: 0.9,
    animationDelay: `${getSeededValue(i, 4) * 0.8}s`,
    animationDuration: `${2 + getSeededValue(i, 5) * 2}s`,
    rotation: `rotate(${getSeededValue(i, 6) * 360}deg)`,
  }));
}

/** CSS class name used on each confetti particle */
export const CONFETTI_PARTICLE_CLASS = 'confetti-particle';

/** Inline <style> block for confetti keyframes — render once per page */
export function ConfettiStyles() {
  return (
    <style>{`
      @keyframes confetti-fall {
        0% {
          transform: translateY(0) rotate(0deg);
          opacity: 1;
        }
        100% {
          transform: translateY(100vh) rotate(720deg);
          opacity: 0;
        }
      }
      .${CONFETTI_PARTICLE_CLASS} {
        animation: confetti-fall ease-out forwards;
      }
    `}</style>
  );
}

interface ConfettiOverlayProps {
  readonly count?: number;
  readonly colors?: string[];
  readonly viewport?: boolean;
}

/** Drop-in confetti overlay — renders particles + keyframe styles */
export function ConfettiOverlay({
  count = DEFAULT_COUNT,
  colors = DEFAULT_COLORS,
  viewport = false,
}: ConfettiOverlayProps = {}) {
  const particles = generateParticles(count, colors);

  return (
    <>
      <div
        className={
          viewport
            ? 'pointer-events-none fixed inset-0 overflow-hidden'
            : 'pointer-events-none absolute inset-0 overflow-hidden'
        }
        aria-hidden='true'
      >
        {particles.map(p => (
          <span
            key={p.id}
            className={`absolute block rounded-sm ${CONFETTI_PARTICLE_CLASS}`}
            style={{
              width: `${p.width}px`,
              height: `${p.height}px`,
              backgroundColor: p.color,
              left: p.left,
              top: '-10px',
              opacity: p.opacity,
              animationDelay: p.animationDelay,
              animationDuration: p.animationDuration,
              transform: p.rotation,
            }}
          />
        ))}
      </div>
      <ConfettiStyles />
    </>
  );
}
