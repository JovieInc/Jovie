import type {
  ReviewInboxPin,
  ReviewInboxPoint,
  ReviewInboxStroke,
} from '@/lib/ovie/review-inbox/contract';
import { cn } from '@/lib/utils';

export interface ReviewCanvasOverlayPin
  extends Omit<ReviewInboxPin, 'assetDigest' | 'revision'> {
  readonly label: number;
}

interface ReviewCanvasOverlayProps {
  readonly savedStrokes: readonly Pick<ReviewInboxStroke, 'id' | 'points'>[];
  readonly draftStrokes: readonly Pick<ReviewInboxStroke, 'id' | 'points'>[];
  readonly activeStroke: readonly ReviewInboxPoint[] | null;
  readonly pins: readonly ReviewCanvasOverlayPin[];
  readonly stale: boolean;
}

function pointsAttr(points: readonly ReviewInboxPoint[]): string {
  return points.map(([x, y]) => `${x},${y}`).join(' ');
}

const LINE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 3,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  vectorEffect: 'non-scaling-stroke',
} as const;

/**
 * Marks drawn over an asset in normalized 0..1 space. The SVG stretches with
 * the asset frame, so strokes stay on the same pixels at any size.
 */
export function ReviewCanvasOverlay({
  savedStrokes,
  draftStrokes,
  activeStroke,
  pins,
  stale,
}: ReviewCanvasOverlayProps) {
  return (
    <>
      <svg
        className='pointer-events-none absolute inset-0 size-full text-warning'
        viewBox='0 0 1 1'
        preserveAspectRatio='none'
        aria-hidden='true'
      >
        {savedStrokes.map(stroke => (
          <polyline
            key={stroke.id}
            data-testid='review-canvas-stroke'
            data-draft='false'
            points={pointsAttr(stroke.points)}
            strokeDasharray={stale ? '6 6' : undefined}
            opacity={stale ? 0.5 : 1}
            {...LINE}
          />
        ))}
        {draftStrokes.map(stroke => (
          <polyline
            key={stroke.id}
            data-testid='review-canvas-stroke'
            data-draft='true'
            points={pointsAttr(stroke.points)}
            {...LINE}
          />
        ))}
        {activeStroke ? (
          <polyline points={pointsAttr(activeStroke)} {...LINE} />
        ) : null}
      </svg>
      {pins.map(pin => (
        <span
          key={pin.id}
          data-testid='review-canvas-pin'
          className={cn(
            'pointer-events-none absolute flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-2xs font-semibold tabular-nums ring-2 ring-canvas-0',
            pin.author === 'agent'
              ? 'bg-surface-0 text-primary-token'
              : 'bg-warning text-black dark:text-black',
            stale && 'opacity-50'
          )}
          style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}
          title={pin.note}
        >
          {pin.label}
        </span>
      ))}
    </>
  );
}
