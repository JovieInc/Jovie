import { Container } from '@/components/site/Container';

export function HomeEngageBentoSection() {
  return (
    <section
      data-testid='homepage-engage-bento'
      className='homepage-chapter'
      aria-labelledby='engage-bento-heading'
    >
      <Container size='homepage'>
        <div className='mx-auto max-w-[1200px]'>
          <h2 id='engage-bento-heading' className='homepage-chapter-title'>
            Engage.
          </h2>
        </div>
      </Container>

      <div className='homepage-bento-track'>
        {/* Placeholder cards — content TBD */}
        <article className='homepage-bento-card'>
          <div className='homepage-bento-card-copy'>
            <h3 className='homepage-bento-card-title'>Smart Links</h3>
            <p className='homepage-bento-card-body'>
              One link routes every fan to their preferred streaming platform.
            </p>
          </div>
        </article>
        <article className='homepage-bento-card'>
          <div className='homepage-bento-card-copy'>
            <h3 className='homepage-bento-card-title'>Pre-save Pages</h3>
            <p className='homepage-bento-card-body'>
              Every upcoming release becomes a countdown page automatically.
            </p>
          </div>
        </article>
        <article className='homepage-bento-card'>
          <div className='homepage-bento-card-copy'>
            <h3 className='homepage-bento-card-title'>Tour Dates</h3>
            <p className='homepage-bento-card-body'>
              Synced from Bandsintown. Nearby fans see shows in their city
              first.
            </p>
          </div>
        </article>
        <article className='homepage-bento-card'>
          <div className='homepage-bento-card-copy'>
            <h3 className='homepage-bento-card-title'>Tips &amp; Support</h3>
            <p className='homepage-bento-card-body'>
              Accept tips from fans with a single tap. QR code included for live
              shows.
            </p>
          </div>
        </article>
      </div>
    </section>
  );
}
