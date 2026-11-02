import { Button } from '@jovie/ui';
import { ArrowRight, Mail } from 'lucide-react';
import Link from 'next/link';
import { Logo } from '@/components/atoms/Logo';
import { fundraisingRegistry } from '@/lib/investors/fundraising-registry';
import { PitchEngagement } from './PitchEngagement';

const CONTACT_EMAIL = 't@meetjovie.com';

interface InvestorBriefProps {
  readonly investorName?: string | null;
}

/** The dated investor deck, rendered only inside the gated portal's main. */
export function InvestorBrief({ investorName = null }: InvestorBriefProps) {
  const registry = fundraisingRegistry;

  return (
    <div className='min-h-svh bg-base text-primary-token'>
      <PitchEngagement />
      <nav className='sticky top-0 z-40 border-b border-subtle bg-(--color-bg-base)/90 backdrop-blur-md print:hidden'>
        <div className='mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-5 sm:px-8'>
          <Link
            aria-label='Jovie Home'
            className='inline-flex min-h-11 items-center'
            href='/'
          >
            <Logo variant='word' tone='auto' size='sm' className='h-7' />
          </Link>
          <Button asChild variant='primary' size='md'>
            <a href='#brief'>Read The Deck</a>
          </Button>
        </div>
      </nav>

      <header className='mx-auto max-w-6xl px-5 pb-10 pt-16 sm:px-8'>
        {investorName ? (
          <p className='mb-3 text-sm text-tertiary-token'>For {investorName}</p>
        ) : null}
        <p className='text-sm font-medium text-secondary-token'>
          Investor Brief · {registry.asOf}
        </p>
        <h1 className='mt-6 max-w-4xl text-balance font-display text-4xl font-semibold tracking-tight sm:text-6xl'>
          {registry.thesis}
        </h1>
        <p className='mt-6 max-w-2xl text-lg leading-relaxed text-secondary-token'>
          {registry.companyDefinition}
        </p>
      </header>

      <ol id='brief' className='mx-auto max-w-6xl px-5 sm:px-8'>
        {registry.coreSlides.map((slide, index) => (
          <li
            className='flex min-h-svh scroll-mt-16 flex-col justify-center border-t border-subtle px-6 py-12 sm:px-10 sm:py-16 print:break-after-page'
            data-pitch-slide={slide.id}
            key={slide.id}
          >
            <div className='mb-8 flex flex-wrap items-center justify-between gap-4'>
              <p className='text-sm font-medium text-secondary-token'>
                {slide.label}
              </p>
              <span className='font-mono text-sm tabular-nums text-tertiary-token'>
                {String(index + 1).padStart(2, '0')} /{' '}
                {String(registry.coreSlides.length).padStart(2, '0')}
              </span>
            </div>
            <p
              className='mb-4 text-sm font-semibold text-accent-blue'
              data-pitch-status
            >
              {slide.status}
            </p>
            <h2 className='max-w-5xl text-balance font-display text-3xl font-semibold leading-tight tracking-tight sm:text-5xl'>
              {slide.dominantSentence}
            </h2>
            <div className='mt-6 max-w-3xl space-y-4 text-base leading-relaxed text-secondary-token sm:text-lg'>
              {slide.support.map(line => (
                <p key={line}>{line}</p>
              ))}
            </div>
            {slide.id === 'product' ? (
              <ul className='mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
                {registry.operatingLoop.map(step => (
                  <li
                    className='rounded-lg border border-subtle bg-surface-1 p-5'
                    key={step.id}
                  >
                    <p className='mb-3 text-xs font-semibold text-accent-blue'>
                      {step.status}
                    </p>
                    <h3 className='text-balance text-base font-semibold'>
                      {step.title}
                    </h3>
                    <p className='mt-2 text-sm leading-relaxed text-secondary-token'>
                      {step.description}
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className='mt-10 flex items-center justify-between gap-4 border-t border-subtle pt-5'>
              <Logo variant='word' tone='auto' size='sm' className='h-7' />
              <p className='text-xs text-tertiary-token'>
                Jovie · {registry.asOf}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <section className='mx-auto max-w-6xl px-5 py-16 sm:px-8'>
        <details
          data-pitch-section='founder-letter'
          className='group border-y border-subtle'
        >
          <summary className='flex min-h-11 cursor-pointer list-none items-center justify-between gap-6 py-6 text-lg font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30'>
            Read The Founder Letter
            <ArrowRight
              className='size-5 group-open:rotate-90'
              aria-hidden='true'
            />
          </summary>
          <div className='max-w-3xl space-y-6 pb-8 text-base leading-relaxed text-secondary-token'>
            {registry.founderLetter.map(paragraph => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            <p className='font-medium text-primary-token'>Tim White, Founder</p>
          </div>
        </details>
        <details
          className='group border-b border-subtle'
          data-testid='pitch-appendix'
        >
          <summary className='flex min-h-11 cursor-pointer list-none items-center justify-between gap-6 py-6 text-lg font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30'>
            Open The Evidence And Questions
            <ArrowRight
              className='size-5 group-open:rotate-90'
              aria-hidden='true'
            />
          </summary>
          <div className='max-w-3xl divide-y divide-subtle'>
            {registry.risks.map(risk => (
              <div className='py-6' key={risk.id}>
                <h3 className='text-balance font-semibold'>{risk.question}</h3>
                <p className='mt-3 text-sm leading-relaxed text-secondary-token'>
                  {risk.answer}
                </p>
                {risk.evidenceGap ? (
                  <p className='mt-3 text-xs text-tertiary-token'>
                    Evidence needed: {risk.evidenceGap}
                  </p>
                ) : null}
              </div>
            ))}
            {registry.appendix.map(item => (
              <div className='py-6' key={item.id}>
                <h3 className='text-balance font-semibold'>{item.title}</h3>
                <p className='mt-3 text-sm leading-relaxed text-secondary-token'>
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </details>
      </section>

      <footer className='border-t border-subtle'>
        <div className='mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-8 px-5 py-12 sm:px-8'>
          <p className='text-secondary-token'>Ask me about the next proof.</p>
          <Button asChild variant='secondary' size='md'>
            <a
              href={`mailto:${CONTACT_EMAIL}?subject=Jovie%20Investor%20Meeting`}
              data-pitch-event='meeting_cta_clicked'
            >
              <Mail className='size-4' aria-hidden='true' />
              Email Tim
            </a>
          </Button>
        </div>
      </footer>
    </div>
  );
}
