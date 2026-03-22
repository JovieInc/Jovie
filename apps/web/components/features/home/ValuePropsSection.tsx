import { Music, Rocket, Users } from 'lucide-react';
import { FigCard, MarketingContainer } from '@/components/marketing';

export function ValuePropsSection() {
  return (
    <section className='section-spacing-linear relative overflow-hidden bg-page'>
      <MarketingContainer width='landing'>
        <div className='reveal-on-scroll mx-auto max-w-3xl text-center'>
          <h2 className='marketing-h2-linear text-primary-token'>
            <strong>A new kind of release tool.</strong>{' '}
            <span className='text-secondary-token'>
              Purpose-built for independent artists. Designed so every release
              reaches every fan, automatically.
            </span>
          </h2>
        </div>

        <div
          className='reveal-on-scroll mt-12 grid gap-3.5 md:grid-cols-3 lg:mt-16'
          data-delay='80'
        >
          <FigCard
            title='Built for artists'
            description='Shaped by the practices of independent musicians who release fast and want their work to reach everyone.'
            icon={<Music className='h-5 w-5' />}
          />
          <FigCard
            title='Automated releases'
            description='Smart links, fan notifications, and email outreach run the moment a release drops. No manual work.'
            icon={<Rocket className='h-5 w-5' />}
          />
          <FigCard
            title='Fan intelligence'
            description='Understand your audience at the individual level. Know who shows up, where they came from, and what converts.'
            icon={<Users className='h-5 w-5' />}
          />
        </div>
      </MarketingContainer>
    </section>
  );
}
