import { Container } from '@/components/site/Container';
import { HomeProfileShowcase } from './HomeProfileShowcase';
import { HOME_COMPARISON_SIDES } from './home-scroll-scenes';

function ComparisonWave({
  variant,
}: Readonly<{
  variant: 'campaign-rhythm' | 'always-on-system';
}>) {
  const path =
    variant === 'campaign-rhythm'
      ? 'M8 70 C28 28, 44 28, 56 70 S86 112, 104 70 S140 20, 156 70 S188 120, 208 72 S240 28, 256 70'
      : 'M8 82 C28 72, 42 74, 58 64 S88 52, 106 56 S142 44, 158 38 S188 30, 208 22 S238 16, 256 10';
  return (
    <svg
      viewBox='0 0 264 120'
      aria-hidden='true'
      className='homepage-comparison-wave'
    >
      <path
        d={path}
        fill='none'
        pathLength='100'
        className={
          variant === 'campaign-rhythm'
            ? 'homepage-comparison-wave-line-muted'
            : 'homepage-comparison-wave-line-active'
        }
      />
    </svg>
  );
}

export function HomeBaselineComparisonSection() {
  const [campaign, system] = HOME_COMPARISON_SIDES;

  if (!campaign || !system) {
    return null;
  }

  return (
    <section
      data-testid='homepage-baseline-comparison'
      className='border-t border-subtle bg-page py-24 sm:py-28 xl:py-36'
      aria-labelledby='homepage-baseline-heading'
    >
      <Container size='homepage'>
        <div className='mx-auto max-w-[1200px]'>
          <div className='max-w-[42rem]'>
            <h2
              id='homepage-baseline-heading'
              className='marketing-h2-linear text-primary-token'
            >
              Keep the momentum going.
            </h2>
            <p className='mt-4 max-w-[37rem] text-[15px] leading-[1.72] text-secondary-token sm:text-[16px]'>
              Campaigns spike and disappear. Jovie keeps something new in front
              of fans so the baseline keeps climbing instead of resetting to
              zero.
            </p>
          </div>

          <div className='homepage-comparison-board mt-12'>
            <article
              className='homepage-comparison-card homepage-comparison-card-muted'
              data-side='campaign'
            >
              <div className='homepage-comparison-card-copy'>
                <h3 className='homepage-comparison-card-title'>
                  Big push. Big silence.
                </h3>
                <p className='homepage-comparison-card-body'>{campaign.body}</p>
              </div>

              <div className='homepage-comparison-list'>
                <div className='homepage-comparison-linktree'>
                  <span className='homepage-comparison-linktree-bar' />
                  <span className='homepage-comparison-linktree-bar' />
                  <span className='homepage-comparison-linktree-bar' />
                  <span className='homepage-comparison-linktree-bar' />
                </div>
                <ComparisonWave variant='campaign-rhythm' />
              </div>
            </article>

            <article
              className='homepage-comparison-card homepage-comparison-card-active'
              data-side='system'
            >
              <div className='homepage-comparison-card-copy'>
                <h3 className='homepage-comparison-card-title'>
                  Keep releasing. Keep climbing.
                </h3>
                <p className='homepage-comparison-card-body'>{system.body}</p>
              </div>

              <div className='homepage-comparison-system'>
                <div className='homepage-comparison-phone-stage'>
                  <HomeProfileShowcase stateId='streams-release-day' compact />
                </div>
                <div className='homepage-comparison-system-shell'>
                  <div className='homepage-comparison-system-chip'>Presave</div>
                  <div className='homepage-comparison-system-chip'>Live</div>
                  <div className='homepage-comparison-system-chip'>Video</div>
                  <div className='homepage-comparison-system-chip'>Show</div>
                </div>
                <ComparisonWave variant='always-on-system' />
              </div>
            </article>
          </div>
        </div>
      </Container>
    </section>
  );
}
