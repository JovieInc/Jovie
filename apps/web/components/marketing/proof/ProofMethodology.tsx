import type { ProofStatDefinition } from '@/lib/proof-stats/registry';
import { cn } from '@/lib/utils';

export interface ProofMethodologyProps {
  /** Public stats from the registry; internal stats are filtered out here too. */
  readonly stats: readonly ProofStatDefinition[];
  readonly className?: string;
}

const CADENCE: Record<ProofStatDefinition['refreshCadence'], string> = {
  hourly: 'Every hour',
  daily: 'Every day',
  weekly: 'Every week',
};

const UNIT: Record<ProofStatDefinition['unit'], string> = {
  count: '',
  ms: ' ms',
  bytes: ' bytes',
  score: ' points',
  ratio: '',
  hours: ' hours',
  minutes: ' minutes',
};

function roundingText(stat: ProofStatDefinition): string {
  const { mode, sigDigits, step } = stat.display.rounding;
  if (mode === 'exact') return 'Shown exactly';
  const direction = mode === 'floor' ? 'down' : 'up';
  if (step)
    return `Rounded ${direction} to the nearest ${step}${UNIT[stat.unit]}`;
  return `Rounded ${direction} to ${sigDigits ?? 2} significant ${
    (sigDigits ?? 2) === 1 ? 'figure' : 'figures'
  }`;
}

function shownWhenText(stat: ProofStatDefinition): string {
  const parts: string[] = [];
  if (stat.threshold !== null)
    parts.push(
      `at ${stat.threshold.toLocaleString('en-US')}${UNIT[stat.unit]} or more`
    );
  if (stat.ceiling !== undefined)
    parts.push(
      `at ${stat.ceiling.toLocaleString('en-US')}${UNIT[stat.unit]} or less`
    );
  if (stat.legalClass !== 'plain') parts.push('after founder review');
  return parts.length ? `Shown ${parts.join(', ')}` : 'Shown whenever current';
}

function freshnessText(stat: ProofStatDefinition): string {
  const hours = stat.freshnessSlaHours;
  const span =
    hours % 24 === 0
      ? `${hours / 24} days`
      : `${hours.toLocaleString('en-US')} hours`;
  return `Hidden if older than ${span}`;
}

/**
 * How every public number is measured, rendered from the proof-stat registry
 * so the page and the numbers cannot drift. States rules and methods only,
 * never a measured value.
 */
export function ProofMethodology({ stats, className }: ProofMethodologyProps) {
  const visible = stats.filter(
    stat =>
      stat.visibility === 'public' && stat.publicMethod && stat.methodology
  );
  return (
    <div className={cn('flex flex-col gap-12', className)}>
      <section className='flex flex-col gap-3'>
        <h2 className='text-lg font-medium text-primary-token text-balance'>
          Rules For Every Number
        </h2>
        <ul className='flex list-disc flex-col gap-2 pl-5 text-sm leading-6 text-secondary-token'>
          <li>Team, test and automated accounts never count.</li>
          <li>
            Counts round down and times round up, so a number is never better
            than the measurement.
          </li>
          <li>
            A number appears only while it is current and past its threshold.
            Otherwise it is removed.
          </li>
          <li>
            Comparisons with other platforms use public pages only and appear
            after founder review.
          </li>
        </ul>
      </section>
      <section className='flex flex-col gap-3'>
        <h2 className='text-lg font-medium text-primary-token text-balance'>
          Benchmark Conditions
        </h2>
        <p className='max-w-2xl text-sm leading-6 text-secondary-token text-pretty'>
          Every week a hosted runner loads one public profile per platform five
          times: Lighthouse with its default mobile profile and simulated
          throttling, plus a rendered browser load. We report the median,
          respect each site&apos;s robots.txt, identify our crawler by name and
          load nothing beyond a normal page view. If Jovie is slower on a
          metric, the benchmark records it and we work on it rather than drop
          it.
        </p>
      </section>
      <section className='flex flex-col gap-6'>
        <h2 className='text-lg font-medium text-primary-token text-balance'>
          What Each Number Means
        </h2>
        <dl className='flex flex-col'>
          {visible.map(stat => (
            <div
              key={stat.id}
              id={stat.id}
              className='flex scroll-mt-24 flex-col gap-2 border-t border-subtle py-5'
            >
              <dt className='text-sm font-medium text-primary-token text-pretty'>
                {stat.label}
              </dt>
              <dd className='max-w-2xl text-sm leading-6 text-secondary-token text-pretty'>
                {stat.publicMethod}
              </dd>
              <dd className='flex flex-wrap gap-x-4 gap-y-1 text-xs text-tertiary-token'>
                <span>{CADENCE[stat.refreshCadence]}</span>
                <span>{roundingText(stat)}</span>
                <span>{shownWhenText(stat)}</span>
                <span>{freshnessText(stat)}</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
