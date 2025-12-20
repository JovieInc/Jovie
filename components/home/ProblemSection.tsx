import { Container } from '@/components/site/Container';

export function ProblemSection() {
  return (
    <section className='py-16 sm:py-20 lg:py-24 bg-base'>
      <Container size='homepage'>
        <div className='max-w-2xl mx-auto'>
          <h2 className='text-3xl sm:text-4xl font-medium tracking-tight text-primary-token text-center mb-8'>
            The problem isn't traffic. It's indecision.
          </h2>

          <div className='space-y-6 text-left'>
            <p className='text-base sm:text-lg text-secondary-token leading-relaxed'>
              Most artist link pages look the same.
            </p>

            <p className='text-base sm:text-lg text-secondary-token leading-relaxed'>
              Fans land, see ten identical links, and guess.
            </p>

            <p className='text-base sm:text-lg text-secondary-token leading-relaxed'>
              Artists never know who clicked, where they came from, or what
              actually worked.
            </p>

            <ul className='space-y-3 mt-8 list-disc list-inside text-base sm:text-lg text-secondary-token'>
              <li>Too many links, no direction</li>
              <li>No way to capture fans early</li>
              <li>No insight into real audience behavior</li>
              <li>Nothing improves over time</li>
            </ul>
          </div>
        </div>
      </Container>
    </section>
  );
}
