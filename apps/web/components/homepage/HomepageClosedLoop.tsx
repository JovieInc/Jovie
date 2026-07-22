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
      className={cn('homepage-closed-loop-section', className)}
      data-testid='homepage-closed-loop'
    >
      <div className='homepage-closed-loop-inner'>
        <div className='homepage-closed-loop-copy'>
          <p>The Jovie loop</p>
          <h2
            className='homepage-closed-loop-headline'
            id='homepage-closed-loop-heading'
          >
            {/* ui-casing-allow: marketing display headline (DESIGN.md Text Casing exception) */}
            Every release makes the next move clearer.
          </h2>
          <p>
            Jovie keeps the signal moving from the work you release to the
            action worth taking next.
          </p>
        </div>

        <div className='homepage-closed-loop-story'>
          <ClosedLoopVisual />

          <ol
            aria-label='The Jovie Closed Loop'
            className='homepage-closed-loop-sequence'
            data-testid='homepage-closed-loop-sequence'
          >
            {CLOSED_LOOP_STEPS.map((step, index) => (
              <li
                className='homepage-closed-loop-step'
                data-testid='homepage-closed-loop-step'
                key={step.id}
              >
                <span
                  aria-hidden='true'
                  className='homepage-closed-loop-step-marker'
                >
                  {index + 1}
                </span>
                <span className='homepage-closed-loop-step-copy'>
                  <span className='homepage-closed-loop-step-title'>
                    {step.title}
                  </span>
                  <span className='homepage-closed-loop-step-description'>
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
      className='homepage-closed-loop-visual'
      data-testid='homepage-closed-loop-visual'
    >
      <svg
        className='homepage-closed-loop-visual-svg'
        fill='none'
        viewBox='0 0 240 240'
        xmlns='http://www.w3.org/2000/svg'
      >
        <title>Five-stage closed loop</title>
        <circle
          className='homepage-closed-loop-visual-ring'
          cx='120'
          cy='120'
          r='76'
          stroke='currentColor'
          strokeWidth='1'
        />
        <g className='homepage-closed-loop-visual-pulse'>
          <path
            d='M120 44a76 76 0 0 1 37.7 10'
            stroke='currentColor'
            strokeLinecap='round'
            strokeWidth='1.5'
          />
          <circle cx='157.7' cy='54' fill='currentColor' r='2.6' />
        </g>
        <path
          className='homepage-closed-loop-visual-arc'
          d='M120 44a76 76 0 0 1 72 52'
          markerEnd='url(#homepage-closed-loop-arrow)'
          stroke='currentColor'
          strokeWidth='1.5'
        />
        <path
          className='homepage-closed-loop-visual-arc homepage-closed-loop-visual-arc--muted'
          d='M192 148a76 76 0 0 1-72 48 76 76 0 0 1-72-52'
          markerEnd='url(#homepage-closed-loop-arrow)'
          stroke='currentColor'
          strokeWidth='1.5'
        />
        <path
          className='homepage-closed-loop-visual-arc'
          d='M48 92a76 76 0 0 1 72-48'
          markerEnd='url(#homepage-closed-loop-arrow)'
          stroke='currentColor'
          strokeWidth='1.5'
        />
        <g className='homepage-closed-loop-visual-nodes' fill='currentColor'>
          <circle
            className='homepage-closed-loop-visual-node--active'
            cx='120'
            cy='44'
            r='3'
          />
          <circle cx='192.3' cy='96.5' r='3' />
          <circle cx='164.7' cy='181.5' r='3' />
          <circle cx='75.3' cy='181.5' r='3' />
          <circle cx='47.7' cy='96.5' r='3' />
        </g>
        <circle
          className='homepage-closed-loop-visual-hub'
          cx='120'
          cy='120'
          fill='currentColor'
          r='30'
          stroke='currentColor'
          strokeWidth='1'
        />
        <circle
          className='homepage-closed-loop-visual-core'
          cx='120'
          cy='120'
          fill='currentColor'
          r='3'
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
      <span className='homepage-closed-loop-visual-caption'>
        Signal, in motion
      </span>
    </figure>
  );
}
