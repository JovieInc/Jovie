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
              scenarioId='design-studio-shell-library-desktop'
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
