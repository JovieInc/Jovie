import { Button } from '@jovie/ui';
import { ArrowRight, Download, Mail } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/atoms/Logo';
import { PitchEngagement } from '@/components/features/pitch/PitchEngagement';
import { fundraisingRegistry } from '@/lib/investors/fundraising-registry';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';

export const revalidate = false;

export const metadata: Metadata = {
  title: 'Jovie — Investor Brief',
  description: 'Jovie investor brief and product walkthrough.',
  robots: NOINDEX_ROBOTS,
};

const CONTACT_EMAIL = 't@meetjovie.com';

const statusTone = {
  LIVE: 'text-accent-blue',
  DEMO: 'text-accent-purple',
  MANUAL: 'text-accent-pink',
  PLANNED: 'text-tertiary-token',
} as const;

export default function PitchPage() {
  const registry = fundraisingRegistry;

  return (
    <main className='min-h-svh bg-base text-primary-token'>
      <PitchEngagement />

      <nav className='sticky top-0 z-40 border-b border-subtle bg-base/90 backdrop-blur-md'>
        <div className='mx-auto flex h-14 max-w-6xl items-center justify-between px-5 sm:px-8'>
          <Link href='/' aria-label='Jovie Home'>
            <Logo variant='word' tone='white' size='xs' />
          </Link>
          <Button asChild variant='primary' size='sm'>
            <a
              href={`mailto:${CONTACT_EMAIL}?subject=Jovie%20Investor%20Meeting`}
              data-pitch-event='meeting_cta_clicked'
            >
              Request A Meeting
            </a>
          </Button>
        </div>
      </nav>

      <header className='mx-auto flex min-h-svh max-w-6xl flex-col justify-center px-5 py-20 sm:px-8 lg:py-28'>
        <p className='mb-6 text-sm font-medium text-secondary-token'>
          Investor Brief · {registry.asOf}
        </p>
        <h1 className='max-w-5xl text-balance font-display text-5xl font-semibold leading-none tracking-tight sm:text-7xl lg:text-8xl'>
          {registry.thesis}
        </h1>
        <p className='mt-8 max-w-2xl text-balance text-lg leading-relaxed text-secondary-token sm:text-xl'>
          {registry.companyDefinition} This brief separates what is live, shown,
          manual, and planned.
        </p>
        <div className='mt-10 flex flex-wrap gap-3'>
          <Button asChild variant='primary'>
            <a href='#demo'>Watch The Product</a>
          </Button>
          <Button asChild variant='secondary'>
            <a href='#brief'>Read The Brief</a>
          </Button>
        </div>
      </header>

      <section id='demo' className='border-y border-subtle bg-surface-0'>
        <div className='mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-28'>
          <div className='mb-10 max-w-3xl'>
            <p className={`mb-3 text-sm font-semibold ${statusTone.DEMO}`}>
              {registry.demo.status}
            </p>
            <h2 className='font-display text-3xl font-semibold tracking-tight sm:text-5xl'>
              {registry.demo.title}
            </h2>
            <p className='mt-4 text-balance text-base leading-relaxed text-secondary-token sm:text-lg'>
              {registry.demo.description}
            </p>
          </div>
          <div className='overflow-hidden rounded-xl border border-subtle bg-black shadow-card dark:bg-black'>
            <video
              aria-label='Jovie Product Walkthrough'
              className='aspect-video w-full object-contain'
              controls
              data-pitch-demo-video
              playsInline
              poster={registry.demo.posterPath}
              preload='metadata'
              src={registry.demo.videoPath}
            >
              <track
                default
                kind='captions'
                label='English'
                src={registry.demo.captionsPath}
                srcLang='en'
              />
            </video>
          </div>
        </div>
      </section>

      <section
        id='brief'
        className='mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-28'
      >
        <div className='mb-12 flex items-end justify-between gap-6'>
          <h2 className='font-display text-3xl font-semibold tracking-tight sm:text-5xl'>
            The Brief
          </h2>
          <p className='hidden text-sm text-tertiary-token sm:block'>
            Seven sentences · About two minutes
          </p>
        </div>
        <ol className='divide-y divide-subtle border-y border-subtle'>
          {registry.coreSlides.map((slide, index) => (
            <li
              className='grid gap-5 py-10 sm:grid-cols-[3rem_1fr] sm:py-14'
              data-pitch-slide={slide.id}
              key={slide.id}
            >
              <span className='font-mono text-sm text-tertiary-token'>
                {String(index + 1).padStart(2, '0')}
              </span>
              <div className='max-w-4xl'>
                <h3 className='text-balance font-display text-2xl font-semibold leading-tight tracking-tight sm:text-4xl'>
                  {slide.dominantSentence}
                </h3>
                {slide.support.map(line => (
                  <p
                    className='mt-4 max-w-2xl text-base leading-relaxed text-secondary-token'
                    key={line}
                  >
                    {line}
                  </p>
                ))}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className='border-y border-subtle bg-surface-0'>
        <div className='mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-28'>
          <div className='mb-12 max-w-3xl'>
            <h2 className='font-display text-3xl font-semibold tracking-tight sm:text-5xl'>
              The Operating Loop, Honestly
            </h2>
            <p className='mt-4 text-base leading-relaxed text-secondary-token sm:text-lg'>
              The workflow is the thesis. The labels are the current evidence
              boundary.
            </p>
          </div>
          <ol className='grid gap-px overflow-hidden rounded-xl border border-subtle bg-subtle sm:grid-cols-2 lg:grid-cols-4'>
            {registry.operatingLoop.map((step, index) => (
              <li className='bg-surface-1 p-6' key={step.id}>
                <div className='mb-8 flex items-center justify-between'>
                  <span
                    className={`text-xs font-semibold ${statusTone[step.status]}`}
                  >
                    {step.status}
                  </span>
                  <span className='font-mono text-xs text-tertiary-token'>
                    {String(index + 1).padStart(2, '0')}
                  </span>
                </div>
                <h3 className='text-lg font-semibold'>{step.title}</h3>
                <p className='mt-3 text-sm leading-relaxed text-secondary-token'>
                  {step.description}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className='mx-auto max-w-4xl px-5 py-20 sm:px-8 lg:py-28'>
        <details
          data-pitch-section='founder-letter'
          className='group border-y border-subtle py-8'
        >
          <summary className='flex cursor-pointer list-none items-center justify-between gap-6 text-xl font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30'>
            Read The Founder Letter
            <ArrowRight
              className='size-5 transition-transform group-open:rotate-90'
              aria-hidden='true'
            />
          </summary>
          <div className='mt-10 space-y-6 text-base leading-relaxed text-secondary-token sm:text-lg'>
            {registry.founderLetter.map(paragraph => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            <p className='font-medium text-primary-token'>
              — Tim White, Founder
            </p>
          </div>
        </details>
      </section>

      <section className='border-y border-subtle bg-surface-0'>
        <div className='mx-auto max-w-4xl px-5 py-20 sm:px-8 lg:py-28'>
          <h2 className='font-display text-3xl font-semibold tracking-tight sm:text-5xl'>
            The Questions That Matter
          </h2>
          <div className='mt-10 divide-y divide-subtle border-y border-subtle'>
            {registry.risks.map(risk => (
              <details className='group py-6' key={risk.id}>
                <summary className='flex cursor-pointer list-none items-center justify-between gap-6 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30'>
                  {risk.question}
                  <ArrowRight
                    className='size-4 shrink-0 transition-transform group-open:rotate-90'
                    aria-hidden='true'
                  />
                </summary>
                <p className='mt-4 max-w-2xl text-sm leading-relaxed text-secondary-token'>
                  {risk.answer}
                </p>
                {risk.evidenceGap ? (
                  <p className='mt-3 text-xs text-tertiary-token'>
                    Evidence needed: {risk.evidenceGap}
                  </p>
                ) : null}
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className='mx-auto max-w-4xl px-5 py-20 sm:px-8'>
        <details
          className='group border-y border-subtle py-8'
          data-testid='pitch-appendix'
        >
          <summary className='flex cursor-pointer list-none items-center justify-between gap-6 text-xl font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30'>
            Open The Appendix
            <ArrowRight
              className='size-5 transition-transform group-open:rotate-90'
              aria-hidden='true'
            />
          </summary>
          <div className='mt-8 divide-y divide-subtle'>
            {registry.appendix.map(item => (
              <div className='py-5' key={item.id}>
                <h3 className='font-semibold'>{item.title}</h3>
                <p className='mt-2 text-sm leading-relaxed text-secondary-token'>
                  {item.body}
                </p>
                {'href' in item ? (
                  <a
                    className='mt-3 inline-flex items-center gap-2 text-sm font-medium text-primary-token underline decoration-subtle underline-offset-4 hover:decoration-current'
                    href={item.href}
                    target='_blank'
                    rel='noreferrer'
                  >
                    {item.id === 'pdf' ? (
                      <Download className='size-4' aria-hidden='true' />
                    ) : null}
                    Open {item.title}
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        </details>
      </section>

      <footer className='border-t border-subtle'>
        <div className='mx-auto flex max-w-4xl flex-col items-start justify-between gap-8 px-5 py-20 sm:flex-row sm:items-center sm:px-8'>
          <div>
            <h2 className='font-display text-3xl font-semibold tracking-tight'>
              Continue The Conversation
            </h2>
            <p className='mt-3 text-secondary-token'>
              Ask about the product, the evidence gaps, or the next proof point.
            </p>
          </div>
          <div className='flex flex-wrap gap-3'>
            <Button asChild variant='primary'>
              <a
                href={`mailto:${CONTACT_EMAIL}?subject=Jovie%20Investor%20Meeting`}
                data-pitch-event='meeting_cta_clicked'
              >
                <Mail className='size-4' aria-hidden='true' />
                Request A Meeting
              </a>
            </Button>
            <Button asChild variant='secondary'>
              <a href={`mailto:${CONTACT_EMAIL}`}>Email Tim</a>
            </Button>
          </div>
        </div>
      </footer>
    </main>
  );
}
