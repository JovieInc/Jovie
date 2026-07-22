import { MarketingScreenshot } from '@/components/marketing/MarketingScreenshot';
import { cn } from '@/lib/utils';

const CLOSED_LOOP_STEPS = [
  {
    id: 'connect',
    title: 'Connect your music',
    description:
      'Keep releases, links, dates, and fan signal in one workspace.',
  },
  {
    id: 'watch',
    title: 'Jovie keeps watch',
    description:
      'Catalog and audience changes stay connected between releases.',
  },
  {
    id: 'choose',
    title: 'Choose what ships',
    description:
      'Jovie surfaces the next opportunity. You decide what goes live.',
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
          <p>How it works</p>
          <h2
            className='homepage-closed-loop-headline'
            data-homepage-section-heading
            id='homepage-closed-loop-heading'
          >
            {/* ui-casing-allow: marketing display headline (DESIGN.md Text Casing exception) */}
            All your music working while you sleep
          </h2>
          <p>
            Jovie keeps your catalog and audience signal together, watches for
            changes, and surfaces the release or fan moment worth acting on.
          </p>
        </div>

        <div className='homepage-closed-loop-story'>
          <figure className='homepage-closed-loop-proof'>
            <MarketingScreenshot
              scenarioId='shell-v1-library-desktop'
              altOverride='Jovie catalog workspace showing an artist release library'
              width={2880}
              height={1800}
              title='Jovie catalog workspace'
            />
          </figure>

          <ol
            aria-label='How It Works'
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
