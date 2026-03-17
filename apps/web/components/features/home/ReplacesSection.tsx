import { ArrowRight } from 'lucide-react';
import { Container } from '@/components/site/Container';

const REPLACES = [
  {
    name: 'Linktree',
    price: '~$6/mo',
    painPoint: 'Link-in-bio page',
    jovieDoes: 'Smart profile with 4 adaptive modes',
  },
  {
    name: 'Linkfire',
    price: '~$10/mo',
    painPoint: 'Create a smart link for every single release',
    jovieDoes: 'Every release gets a smart link automatically. No manual work.',
  },
  {
    name: 'Mailchimp',
    price: '~$13/mo',
    painPoint:
      'Compose an email, fight the template builder, hope someone opens it',
    jovieDoes:
      'One high-converting notification fires for every release. No composing, no templates\u00a0— and it gets clicks.',
  },
];

export function ReplacesSection() {
  return (
    <section className='section-spacing-linear relative overflow-hidden bg-page'>
      <Container size='homepage'>
        <div className='relative mx-auto max-w-[var(--linear-content-max)]'>
          {/* Header */}
          <div className='reveal-on-scroll flex flex-col items-center text-center gap-5 mb-16'>
            <span className='inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium tracking-[-0.01em] text-tertiary-token border border-subtle'>
              Why switch
            </span>
            <h2 className='marketing-h2-linear text-primary-token'>
              One tool instead of three.
            </h2>
            <p className='max-w-lg marketing-lead-linear text-secondary-token'>
              Most artists juggle a link page, a smart link service, and an
              email tool&nbsp;&mdash; and none of them talk to each other. Jovie
              replaces all three.
            </p>
          </div>

          {/* Cards */}
          <div
            className='reveal-on-scroll grid grid-cols-1 md:grid-cols-3 gap-6'
            data-delay='80'
          >
            {REPLACES.map(item => (
              <div
                key={item.name}
                className='relative flex flex-col rounded-xl border border-subtle bg-surface-0 p-8'
              >
                {/* Competitor name + price (struck through) */}
                <p className='text-[15px] font-medium text-primary-token line-through opacity-60'>
                  {item.name}
                </p>
                <p className='mt-1 text-[13px] text-tertiary-token line-through'>
                  {item.price}
                </p>

                {/* Pain point */}
                <p className='mt-4 text-[13px] leading-relaxed text-tertiary-token'>
                  {item.painPoint}
                </p>

                {/* Divider */}
                <div className='my-5 flex items-center gap-3'>
                  <div className='h-px flex-1 bg-(--linear-border-subtle)' />
                  <span className='text-[11px] font-medium uppercase tracking-wider text-tertiary-token'>
                    Replaced by Jovie
                  </span>
                  <div className='h-px flex-1 bg-(--linear-border-subtle)' />
                </div>

                {/* Jovie replacement */}
                <div className='flex gap-2.5'>
                  <ArrowRight
                    className='mt-0.5 h-4 w-4 shrink-0 text-accent'
                    aria-hidden='true'
                  />
                  <p className='text-[14px] leading-relaxed text-secondary-token'>
                    {item.jovieDoes}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Summary */}
          <p className='reveal-on-scroll mt-10 text-center text-[14px] text-tertiary-token'>
            ~$29/mo for three tools, or $0&ndash;$12/mo for one that connects
            everything.
          </p>
        </div>
      </Container>
    </section>
  );
}
