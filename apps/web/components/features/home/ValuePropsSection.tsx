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
                Jovie combines the public profile, release workflow, and
                follow-up system into one surface. The result feels closer to a
                product system than a generic link page.
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
            description='Shaped around the way independent musicians launch: one catalog, many release moments, one place to send people.'
            icon={<Music className='h-5 w-5' />}
          />
          <FigCard
            title='Automated releases'
            description='Smart links, notifications, and launch follow-up trigger the moment a release goes live. No manual checklist.'
            icon={<Rocket className='h-5 w-5' />}
          />
          <FigCard
            title='Fan intelligence'
            description='See who shows up, where they came from, and what converts before you guess at the next push.'
            icon={<Users className='h-5 w-5' />}
          />
        </div>
      </MarketingContainer>
    </section>
  );
}
