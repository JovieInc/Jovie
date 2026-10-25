import { CinematicMetric } from '@jovie/ui/atoms/cinematic-metric';
import {
  HOME_LOOP_TONE_LABELS,
  HomeLoopConstraintBanner,
} from '@/components/organisms/home-loop/HomeLoopPulse';
import type { HomeLoopSectionStatus } from '@/components/organisms/home-loop/HomeLoopSection';
import { HomeLoopStageStrip } from '@/components/organisms/home-loop/HomeLoopStageStrip';
import type {
  HomeLoopConstraint,
  HomeLoopCopy,
  HomeLoopStripItem,
  HomeLoopTile,
} from '@/lib/home-loop/contract';
import { buildPulse } from '@/lib/ovie/home/shipping-home';
import { emptyDeliverySummary } from '@/lib/ovie/shipping-state/contract';

// The canonical projection supplies the same ordered slots before first data.
const UNMEASURED_PULSE = buildPulse(emptyDeliverySummary());

export interface OvieHomeHeroProps {
  readonly copy: HomeLoopCopy;
  readonly constraint: HomeLoopConstraint | null;
  readonly tiles: readonly HomeLoopTile[];
  readonly status: HomeLoopSectionStatus;
  readonly strip: readonly HomeLoopStripItem[];
  readonly coverage: string | null;
}

/** One focal readout, over the shell-owned canvas, with no new data lifecycle. */
export function OvieHomeHero({
  copy,
  constraint,
  tiles,
  status,
  strip,
  coverage,
}: OvieHomeHeroProps) {
  const metrics = tiles.length ? tiles : UNMEASURED_PULSE;
  return (
    <section
      aria-label='Shipping Overview'
      className='relative isolate shrink-0 rounded-xl'
      data-testid='ovie-home-hero'
    >
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0 -z-10 rounded-xl bg-surface-1/50 backdrop-blur-md'
        data-testid='ovie-home-editorial-layer'
      />
      <div className='flex flex-col gap-3 p-4'>
        <HomeLoopConstraintBanner
          appearance='quiet'
          constraint={
            status === 'error'
              ? { tone: 'bad', text: copy.inFlightError }
              : status === 'ready'
                ? constraint
                : null
          }
          emptyLabel={copy.constraintClear}
          loading={status === 'loading'}
        />
        <div
          className='grid grid-cols-2 items-end gap-x-6 gap-y-3 sm:grid-cols-4 @5xl:grid-cols-12'
          data-testid='ovie-home-metrics'
          aria-busy={status === 'loading'}
        >
          {metrics.map((tile, index) => (
            <div
              key={tile.key}
              className={index === 0 ? 'col-span-2 min-w-0' : 'min-w-0'}
              data-testid={`home-loop-tile-${tile.key}`}
              data-measured={tile.measured}
              data-tone={tile.tone}
            >
              <CinematicMetric
                label={tile.label}
                value={tile.measured ? tile.value : null}
                loading={status === 'loading'}
                density={index === 0 ? 'glance' : 'summary'}
                detail={
                  tile.measured
                    ? `${tile.was ? `Was ${tile.was} · ` : ''}${HOME_LOOP_TONE_LABELS[tile.tone]}`
                    : null
                }
              />
            </div>
          ))}
        </div>
        <div className='h-10 shrink-0'>
          <HomeLoopStageStrip
            appearance='quiet'
            title={copy.latencyTitle ?? 'Stage Time'}
            items={status === 'ready' ? strip : []}
            coverage={status === 'ready' ? coverage : null}
            emptyLabel={copy.latencyEmpty ?? 'Not measured'}
          />
        </div>
      </div>
    </section>
  );
}
