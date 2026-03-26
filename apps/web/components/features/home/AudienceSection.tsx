import { Mail, MapPin, Users } from 'lucide-react';
import { FigCard } from '@/components/marketing';
import { Container } from '@/components/site/Container';
import { ProductScreenshot } from './ProductScreenshot';

export function AudienceSection() {
  return (
    <section className='section-spacing-linear'>
      <Container size='homepage'>
        <div className='mx-auto max-w-[var(--linear-content-max)]'>
          <div className='homepage-section-shell'>
            <div className='homepage-section-intro reveal-on-scroll'>
              <div>
                <p className='homepage-section-eyebrow'>Audience</p>
                <h2 className='marketing-h2-linear mt-5 text-primary-token'>
                  Know every fan by name.
                </h2>
              </div>
              <div className='homepage-section-copy'>
                <p className='marketing-lead-linear text-secondary-token'>
                  See who keeps showing up, where they came from, and what
                  actually drives growth — all in one CRM you own.
                </p>
              </div>
            </div>
          </div>

          <div
            className='reveal-on-scroll grid gap-3.5 md:grid-cols-3'
            data-delay='80'
          >
            <FigCard
              title='Fan intelligence'
              description='Identify your super-fans before they even know they are. See who returns, who converts, who shares.'
              icon={<Users className='h-5 w-5' />}
            />
            <FigCard
              title='Source tracking'
              description='Know which platform drove every fan. Instagram, TikTok, Spotify — see what actually converts.'
              icon={<MapPin className='h-5 w-5' />}
            />
            <FigCard
              title='Email capture'
              description='Build your list with every release. Own your audience — no algorithm can take it away.'
              icon={<Mail className='h-5 w-5' />}
            />
          </div>

          <div className='reveal-on-scroll mt-12 lg:mt-16' data-delay='120'>
            <ProductScreenshot
              src='/product-screenshots/audience-crm.png'
              alt='Jovie audience CRM showing fan contacts with source tracking and engagement data'
              width={2880}
              height={1800}
              skipCheck
            />
          </div>
        </div>
      </Container>
    </section>
  );
}
