import { Container } from '@/components/site/Container';

export function DifferentiationSection() {
  return (
    <section className='py-16 sm:py-20 lg:py-24 bg-surface-0'>
      <Container size='homepage'>
        <div className='max-w-3xl mx-auto text-center mb-12'>
          <h2 className='text-3xl sm:text-4xl font-medium tracking-tight text-primary-token'>
            Not another list of links.
          </h2>
        </div>

        <div className='grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16 max-w-4xl mx-auto'>
          {/* Left Column - Traditional link pages */}
          <div className='space-y-4'>
            <h3 className='text-xl font-medium text-primary-token mb-6'>
              Traditional link pages
            </h3>
            <ul className='space-y-3 text-base text-secondary-token'>
              <li>Static links</li>
              <li>Same experience for everyone</li>
              <li>No learning</li>
              <li>No audience ownership</li>
            </ul>
          </div>

          {/* Right Column - This platform */}
          <div className='space-y-4'>
            <h3 className='text-xl font-medium text-primary-token mb-6'>
              This platform
            </h3>
            <ul className='space-y-3 text-base text-secondary-token'>
              <li>One guided action</li>
              <li>Adapts per fan</li>
              <li>Improves automatically</li>
              <li>Own your fan list</li>
            </ul>
          </div>
        </div>
      </Container>
    </section>
  );
}
