import Link from 'next/link';
import { MarketingContainer } from '@/components/marketing';

const TESTIMONIALS = [
  {
    quote:
      'I dropped my single and the smart link was already live. Jovie handled the rest — notifications, emails, everything.',
    name: 'Maya Cole',
    role: 'Producer / LA',
  },
  {
    quote:
      'Switched from Linktree and my click-through rate doubled overnight. The smart links just work.',
    name: 'DJ Luna',
    role: 'Electronic / NYC',
  },
];

export function TestimonialsSection() {
  return (
    <section className='section-spacing-linear'>
      <MarketingContainer width='landing'>
        <div className='grid gap-6 md:grid-cols-2'>
          {TESTIMONIALS.map(testimonial => (
            <Link
              key={testimonial.name}
              href='/'
              className='group block rounded-[1rem] border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] p-6 transition-colors hover:border-[rgba(255,255,255,0.1)] md:p-8'
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
            </Link>
          ))}
        </div>

        <div className='reveal-on-scroll mt-12 text-center'>
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
