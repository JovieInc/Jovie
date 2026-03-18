import { Badge } from '@jovie/ui/atoms/badge';
import { Container } from '@/components/site/Container';
import { TestimonialCard } from './TestimonialCard';

const TESTIMONIALS = [
  {
    initials: 'TW',
    name: 'Tim White',
    title: 'Founder & Artist',
    quote:
      'I built Jovie because I was tired of juggling five different tools just to share my music. Now every release, every link, every fan notification lives in one place.',
  },
  {
    initials: 'DL',
    name: 'DJ Luna',
    title: 'Electronic / NYC',
    quote:
      'I imported my whole catalog in 60 seconds. My fans actually know when I drop now.',
  },
  {
    initials: 'MC',
    name: 'Maya Cole',
    title: 'Producer / LA',
    quote:
      'Switched from Linktree and my click-through rate doubled overnight. The smart links just work.',
  },
] as const;

export function TestimonialsSection() {
  return (
    <section className='section-spacing-linear relative overflow-hidden bg-page'>
      <Container size='homepage'>
        <div className='relative mx-auto max-w-[var(--linear-content-max)]'>
          <div className='reveal-on-scroll mb-16 flex flex-col items-center gap-5 text-center'>
            <Badge variant='outline' size='xl'>
              Testimonials
            </Badge>
            <h2 className='marketing-h2-linear text-primary-token'>
              What creators are saying
            </h2>
            <p className='max-w-md marketing-lead-linear text-secondary-token'>
              Artists are simplifying their careers and growing their fanbases
              with Jovie.
            </p>
          </div>

          <div
            className='reveal-on-scroll mx-auto grid max-w-4xl grid-cols-1 gap-6 sm:grid-cols-3'
            data-delay='80'
          >
            {TESTIMONIALS.map(testimonial => (
              <TestimonialCard
                key={testimonial.name}
                initials={testimonial.initials}
                name={testimonial.name}
                title={testimonial.title}
                quote={testimonial.quote}
              />
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
