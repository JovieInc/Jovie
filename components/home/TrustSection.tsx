import { Container } from '@/components/site/Container';

export function TrustSection() {
  return (
    <section className='py-16 sm:py-20 lg:py-24 bg-base border-t border-subtle'>
      <Container size='homepage'>
        <div className='max-w-2xl mx-auto text-center space-y-4'>
          <div className='inline-flex items-center px-3 py-1 rounded-full border border-subtle bg-surface-0 text-xs font-medium text-secondary-token mb-4'>
            Private Alpha
          </div>

          <p className='text-base sm:text-lg text-secondary-token leading-relaxed'>
            Built alongside working artists during private alpha. Access is
            limited while we onboard manually to ensure quality.
          </p>
        </div>
      </Container>
    </section>
  );
}
