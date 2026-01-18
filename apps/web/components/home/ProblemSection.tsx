import { CheckCircle2 } from 'lucide-react';
import { Container } from '@/components/site/Container';

const benefits = [
  {
    title: 'Capture every visitor',
    description: 'Email & SMS on first visit. No bounce, no lost fans.',
  },
  {
    title: 'One clear action',
    description:
      'AI picks the right CTA for each fan. Stream, buy tickets, or grab merch.',
  },
  {
    title: 'Continuous optimization',
    description: 'Your page improves itself based on what converts.',
  },
];

export function ProblemSection() {
  return (
    <section className='section-spacing-linear bg-base border-t border-subtle'>
      <Container size='homepage'>
        <div className='max-w-3xl mx-auto'>
          <h2 className='marketing-h2-linear text-center mb-12'>
            Everything you need.{' '}
            <span className='text-tertiary-token'>Nothing you don&apos;t.</span>
          </h2>

          <div className='space-y-8'>
            {benefits.map(benefit => (
              <div key={benefit.title} className='flex items-start gap-4'>
                {/* Icon - Linear 24px treatment */}
                <div className='flex items-center justify-center w-6 h-6 shrink-0'>
                  <CheckCircle2 className='w-5 h-5 text-success' />
                </div>
                <div className='space-y-1'>
                  <h3 className='text-lg font-medium text-primary-token'>
                    {benefit.title}
                  </h3>
                  <p className='marketing-lead-linear text-tertiary-token'>
                    {benefit.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
