import { MarketingContainer } from '@/components/marketing';

const TESTIMONIALS = [
  {
    quote:
      "The internet rewards consistency — but you can't consistently make music if you're consistently marketing it. I built Jovie to automate every system I used to do by hand, so I could spend more time in the studio and less time hunched over a laptop.",
    name: 'Tim White',
    role: 'Founder',
  },
];

export function TestimonialsSection() {
  return (
    <section className='section-spacing-linear'>
      <MarketingContainer width='landing'>
        <div className='mx-auto max-w-[42rem]'>
          {TESTIMONIALS.map(testimonial => (
            <article
              key={testimonial.name}
              className='rounded-[1rem] border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] p-6 transition-colors hover:border-[rgba(255,255,255,0.1)] md:p-8'
            >
              <p className='text-[17px] leading-relaxed text-primary-token'>
                {testimonial.quote}
              </p>
              <p className='mt-4 text-sm text-tertiary-token'>
                {testimonial.name}{' '}
                <span className='text-quaternary-token'>
                  {testimonial.role}
                </span>
              </p>
            </article>
          ))}
        </div>

        <div className='reveal-on-scroll mt-12'>
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
