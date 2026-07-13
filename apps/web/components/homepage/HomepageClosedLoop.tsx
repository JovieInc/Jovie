import { cn } from '@/lib/utils';

const CLOSED_LOOP_STEPS = [
  {
    id: 'release',
    title: 'Release',
    description: 'Put the work into the world.',
  },
  {
    id: 'capture',
    title: 'Capture',
    description: 'Give every response a place to land.',
  },
  {
    id: 'route',
    title: 'Route',
    description: 'Send the right signal to the right next move.',
  },
  {
    id: 'learn',
    title: 'Learn',
    description: 'See what people care about.',
  },
  {
    id: 'next action',
    title: 'Next Action',
    description: 'Use that signal to shape what comes next.',
  },
] as const;

interface HomepageClosedLoopProps {
  readonly className?: string;
}

export function HomepageClosedLoop({
  className,
}: HomepageClosedLoopProps = {}) {
  return (
    <section
      aria-labelledby='homepage-closed-loop-heading'
      className={cn(
        'homepage-closed-loop-section w-full border-t border-subtle py-20 text-primary-token md:py-28',
        className
      )}
      data-testid='homepage-closed-loop'
    >
      <div className='homepage-closed-loop-inner mx-auto grid w-full max-w-6xl gap-14 px-6 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] md:items-center md:gap-20 lg:px-10'>
        <div className='homepage-closed-loop-copy max-w-xl'>
          <p className='mb-4 text-sm font-medium text-secondary-token'>
            The Jovie loop
          </p>
          <h2
            className='max-w-lg text-3xl font-semibold tracking-tight text-primary-token text-balance md:text-5xl'
            id='homepage-closed-loop-heading'
          >
            Every Release Makes The Next Move Clearer.
          </h2>
          <p className='mt-5 max-w-md text-base leading-7 text-secondary-token md:text-lg'>
            Jovie keeps the signal moving from the work you release to the
            action worth taking next.
          </p>
        </div>

        <div className='homepage-closed-loop-story grid gap-10 md:grid-cols-[minmax(180px,0.7fr)_minmax(0,1fr)] md:items-center md:gap-12'>
          <ClosedLoopVisual />

          <ol
            aria-label='The Jovie Closed Loop'
            className='homepage-closed-loop-sequence m-0 grid list-none gap-0 p-0'
            data-testid='homepage-closed-loop-sequence'
          >
            {CLOSED_LOOP_STEPS.map((step, index) => (
              <li
                className='homepage-closed-loop-step relative grid grid-cols-[2rem_minmax(0,1fr)] gap-4 pb-7 last:pb-0'
                data-testid='homepage-closed-loop-step'
                key={step.id}
              >
                <span
                  aria-hidden='true'
                  className='homepage-closed-loop-step-marker relative z-10 mt-0.5 grid size-8 place-items-center rounded-full border border-subtle bg-surface-0 text-xs font-medium text-primary-token'
                >
                  {index + 1}
                </span>
                <span className='homepage-closed-loop-step-copy block border-b border-subtle pb-7 last:border-0'>
                  <span className='block text-base font-medium text-primary-token'>
                    {step.title}
                  </span>
                  <span className='mt-1 block text-sm leading-6 text-secondary-token'>
                    {step.description}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

function ClosedLoopVisual() {
  return (
    <figure
      aria-hidden='true'
      className='homepage-closed-loop-visual relative mx-auto aspect-square w-full max-w-64 text-secondary-token'
      data-testid='homepage-closed-loop-visual'
    >
      <svg
        className='absolute inset-0 size-full'
        fill='none'
        viewBox='0 0 240 240'
        xmlns='http://www.w3.org/2000/svg'
      >
        <title>Five-stage closed loop</title>
        <circle
          className='text-primary-token'
          cx='120'
          cy='120'
          r='76'
          stroke='currentColor'
          strokeDasharray='2 8'
          strokeWidth='1'
        />
        <path
          className='text-primary-token'
          d='M120 44a76 76 0 0 1 72 52'
          markerEnd='url(#homepage-closed-loop-arrow)'
          stroke='currentColor'
          strokeWidth='1.5'
        />
        <path
          className='text-secondary-token'
          d='M192 148a76 76 0 0 1-72 48 76 76 0 0 1-72-52'
          markerEnd='url(#homepage-closed-loop-arrow)'
          stroke='currentColor'
          strokeWidth='1.5'
        />
        <path
          className='text-primary-token'
          d='M48 92a76 76 0 0 1 72-48'
          markerEnd='url(#homepage-closed-loop-arrow)'
          stroke='currentColor'
          strokeWidth='1.5'
        />
        <circle
          className='fill-surface-0 text-primary-token'
          cx='120'
          cy='120'
          fill='currentColor'
          r='30'
          stroke='currentColor'
          strokeWidth='1'
        />
        <path
          className='text-secondary-token'
          d='M111 120h18M120 111v18'
          stroke='currentColor'
          strokeLinecap='round'
          strokeWidth='1.5'
        />
        <defs>
          <marker
            id='homepage-closed-loop-arrow'
            markerHeight='5'
            markerWidth='5'
            orient='auto-start-reverse'
            refX='4'
            refY='2.5'
            viewBox='0 0 5 5'
          >
            <path d='M0 0L5 2.5L0 5' fill='currentColor' />
          </marker>
        </defs>
      </svg>
      <span className='absolute inset-x-0 bottom-4 text-center text-xs font-medium text-secondary-token'>
        Signal, in motion
      </span>
    </figure>
  );
}
