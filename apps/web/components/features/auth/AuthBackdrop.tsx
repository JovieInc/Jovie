import type { CSSProperties } from 'react';

const mix = (token: string, percent: number) =>
  `color-mix(in oklab, var(${token}) ${percent}%, transparent)`;
const ion = (percent: number) => mix('--color-accent', percent);
const ink = (percent: number) => mix('--color-bg-base', percent);

/**
 * Pen odZZY "Full-bleed gradient — proof atom": blue glow top right and
 * bottom left, under a cinematic vignette and a dark scrim behind the
 * column so the form keeps its contrast.
 */
const GLOW: CSSProperties = {
  backgroundImage: [
    `radial-gradient(ellipse 19% 12% at 82% 12%, ${mix('--color-text-primary', 15)}, transparent)`,
    `radial-gradient(ellipse 102.5% 31% at 118% -8%, ${ion(75)}, transparent)`,
    `radial-gradient(ellipse 70% 25% at 86% 10%, ${ion(47)}, transparent)`,
    `radial-gradient(ellipse 62.5% 33% at -8% 116%, ${ion(39)}, transparent)`,
  ].join(', '),
};

const VEIL: CSSProperties = {
  backgroundImage: [
    `radial-gradient(ellipse 34.7% 44.4% at 50% 50%, ${ink(70)}, transparent)`,
    `radial-gradient(ellipse 57.5% 67.5% at 50% 46%, transparent 45%, ${ink(85)})`,
  ].join(', '),
};

export function AuthBackdrop() {
  return (
    <div
      aria-hidden
      data-auth-backdrop
      className='pointer-events-none fixed inset-0 -z-10'
    >
      <div className='absolute inset-0' style={GLOW} />
      <div className='absolute inset-0' style={VEIL} />
    </div>
  );
}
