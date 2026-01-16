import { Container } from '@/components/site/Container';
import { ComparisonCanvas } from './ComparisonCanvas';

export function ComparisonSection() {
  return (
    <section
      className='section-spacing-linear bg-base border-t border-subtle'
      aria-label='Comparison: Wall of Links versus Jovie Profile'
    >
      <Container size='homepage'>
        {/* Heading - above mockups */}
        <div className='max-w-3xl mx-auto text-center mb-12'>
          <h2 className='marketing-h2-linear text-primary-token mb-6'>
            One action. The right one.
          </h2>
          <p className='marketing-lead-linear text-tertiary-token max-w-2xl mx-auto'>
            Most link-in-bio traffic bounces. Jovie converts it.
          </p>
        </div>

        {/* Visual comparison */}
        <ComparisonCanvas />
      </Container>
    </section>
  );
}
