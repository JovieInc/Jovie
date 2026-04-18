import { MarketingContainer } from '@/components/marketing';

export function TestimonialsSection() {
  return (
    <section className='section-spacing-linear'>
      <MarketingContainer width='landing'>
        <div className='reveal-on-scroll'>
          <p className='text-[17px] leading-relaxed text-secondary-token'>
            Jovie is built for{' '}
            <strong className='text-primary-token'>independent artists</strong>.
            From first releases to world tours.
          </p>
        </div>
      </MarketingContainer>
    </section>
  );
}
