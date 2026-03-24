import { Music, Rocket, Users } from 'lucide-react';
import { FigCard, MarketingContainer } from '@/components/marketing';

export function ValuePropsSection() {
  return (
    <section className='section-spacing-linear relative overflow-hidden bg-page'>
      <MarketingContainer width='landing'>
        <div className='homepage-section-shell'>
          <div className='homepage-section-intro reveal-on-scroll'>
            <div>
              <p className='marketing-kicker'>Why artists switch</p>
              <h2 className='marketing-h2-linear mt-6 max-w-[12ch] text-primary-token'>
                Built for releases, not just links.
              </h2>
            </div>

            <div className='homepage-section-copy'>
              <p className='marketing-lead-linear text-secondary-token'>
                Jovie brings your profile, release workflow, and follow-up into
                one launch surface.
              </p>
            </div>
          </div>
        </div>

        <div
          className='reveal-on-scroll homepage-section-stack grid gap-3.5 md:grid-cols-3'
          data-delay='80'
        >
          <FigCard
            title='Built for artists'
            description='Built around how independent artists launch, with one home for every release moment.'
            icon={<Music className='h-5 w-5' />}
          />
          <FigCard
            title='Automated releases'
            description='Smart links and launch follow-up trigger the moment a release goes live.'
            icon={<Rocket className='h-5 w-5' />}
          />
          <FigCard
            title='Fan intelligence'
            description='See who shows up, where they came from, and what converts before the next push.'
            icon={<Users className='h-5 w-5' />}
          />
        </div>
      </MarketingContainer>
    </section>
  );
}
