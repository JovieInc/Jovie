import { cn } from '@/lib/utils';

const NOISE_SVG =
  "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.6 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E";

interface CanvasGrainProps {
  readonly className?: string;
}

/**
 * Static SVG noise overlay rasterized once and GPU-composited per frame -
 * no animation, no per-frame work. ~6% mix-overlay so it reads as paper
 * roughness without coloring the design. Performance cost ~0 after first
 * paint. Mounted once inside the app shell main element.
 */
export function CanvasGrain({ className }: CanvasGrainProps) {
  return (
    <div
      aria-hidden='true'
      className={cn('pointer-events-none absolute inset-0', className)}
      style={{
        mixBlendMode: 'overlay',
        opacity: 0.06,
        backgroundImage: `url("${NOISE_SVG}")`,
        backgroundRepeat: 'repeat',
        backgroundSize: '200px 200px',
      }}
    />
  );
}
