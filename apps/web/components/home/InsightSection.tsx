import { Container } from '@/components/site/Container';

export function InsightSection() {
  return (
    <section className='section-spacing-linear bg-base border-t border-subtle'>
      <Container size='homepage'>
        <div className='max-w-3xl mx-auto text-center'>
          <h2 className='marketing-h2-linear text-primary-token mb-8'>
            One action. The right one.
          </h2>

          <p className='marketing-lead-linear text-tertiary-token max-w-2xl mx-auto'>
            Jovie shows each fan the single best next step—subscribe, stream, or
            buy—based on who they are and how they got here. Every click teaches
            the page to convert better.
          </p>
        </div>
      </Container>
    </section>
  );
}
