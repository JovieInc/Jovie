import { TestimonialCard } from '@/components/features/home/TestimonialCard';
import type { SectionVariant } from '../registry';

function TestimonialDemoGrid() {
  return (
    <div className='mx-auto grid max-w-[1100px] grid-cols-1 gap-6 px-6 py-16 md:grid-cols-3'>
      <TestimonialCard
        name='Maya R.'
        title='Indie producer'
        initials='MR'
        quote='I used to spend the week before a drop wrangling links and DMs. Now I open Jovie, queue the rollout, and get back to mixing.'
      />
      <TestimonialCard
        name='Devon S.'
        title='Touring DJ'
        initials='DS'
        quote='The catalog health view caught two ISRC mismatches the day my distributor said everything was fine. Saved me a streaming gap.'
      />
      <TestimonialCard
        name='June K.'
        title='Artist + label owner'
        initials='JK'
        quote='Pre-save funnel + fan capture + one link. Replaces three SaaS subs and actually integrates with my catalog.'
      />
    </div>
  );
}

export const TESTIMONIAL_VARIANTS: readonly SectionVariant[] = [
  {
    id: 'testimonial-card-3up',
    category: 'testimonial',
    label: 'Testimonial cards — 3-up grid',
    description:
      'Three centered cards. Currently the only testimonial section pattern.',
    componentPath: 'components/features/home/TestimonialCard.tsx',
    usedIn: [],
    status: 'canonical',
    canonical: true,
    render: () => <TestimonialDemoGrid />,
  },
];
