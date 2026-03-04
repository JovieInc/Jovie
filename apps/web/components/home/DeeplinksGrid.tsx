import type { ReactNode } from 'react';
import { Container } from '@/components/site/Container';

/* ------------------------------------------------------------------ */
/*  Card mockups — premium fidelity                                    */
/* ------------------------------------------------------------------ */

function TipMockup() {
  return (
    <div className='flex flex-col gap-3'>
      <p className='text-[10px] font-[var(--linear-font-weight-medium)] uppercase tracking-[0.15em] text-[var(--linear-text-tertiary)]'>
        Choose amount
      </p>
      <div className='grid grid-cols-3 gap-3 border-0 p-0 m-0'>
        {['$3', '$5', '$10'].map(amt => (
          <div
            key={amt}
            className='group relative w-full aspect-square rounded-2xl border text-center transition-all duration-150 ease-out flex flex-col items-center justify-center gap-0.5'
            style={{
              backgroundColor:
                amt === '$5'
                  ? 'var(--linear-text-primary)'
                  : 'var(--linear-bg-surface-0)',
              color:
                amt === '$5'
                  ? 'var(--linear-bg-page)'
                  : 'var(--linear-text-primary)',
              border:
                amt === '$5'
                  ? '1px solid transparent'
                  : '1px solid var(--linear-border-subtle)',
              boxShadow: amt === '$5' ? 'var(--linear-shadow-card)' : 'none',
            }}
          >
            <span
              className='text-[10px] font-[var(--linear-font-weight-medium)] uppercase tracking-wider'
              style={{
                color:
                  amt === '$5'
                    ? 'var(--linear-text-inverse)'
                    : 'var(--linear-text-tertiary)',
              }}
            >
              USD
            </span>
            <span className='text-2xl font-[var(--linear-font-weight-semibold)] tabular-nums tracking-tight'>
              {amt}
            </span>
          </div>
        ))}
      </div>
      <div
        className='flex items-center justify-center rounded-xl px-4 py-3 text-[var(--linear-caption-size)] font-[var(--linear-font-weight-medium)] w-full mt-1 bg-[var(--linear-text-primary)] text-[var(--linear-bg-page)]'
        style={{
          boxShadow: 'var(--linear-shadow-card)',
        }}
      >
        Continue with Venmo
      </div>
    </div>
  );
}

function TourMockup() {
  const shows = [
    { city: 'Atlanta, GA', venue: 'The Earl', date: 'Mar 14' },
    { city: 'Nashville, TN', venue: 'Exit/In', date: 'Mar 21' },
    { city: 'Brooklyn, NY', venue: "Baby's All Right", date: 'Apr 4' },
  ];
  return (
    <div className='flex flex-col gap-2'>
      {shows.map(show => (
        <div
          key={show.city}
          className='flex items-center justify-between p-3 rounded-xl transition-colors hover:bg-[var(--linear-bg-hover)] cursor-pointer group bg-[var(--linear-bg-surface-0)] border border-[var(--linear-border-subtle)]'
        >
          <div className='flex flex-col gap-0.5'>
            <span className='text-[var(--linear-text-primary)] font-[var(--linear-font-weight-medium)] text-[var(--linear-caption-size)] tracking-[-0.01em]'>
              {show.city}
            </span>
            <span className='text-[var(--linear-text-tertiary)] text-[var(--linear-label-size)]'>
              {show.date} · {show.venue}
            </span>
          </div>
          <button
            type='button'
            className='px-3 py-1.5 rounded-full text-[12px] font-medium bg-[var(--linear-text-primary)] text-[var(--linear-bg-page)] hover:scale-[1.02] transition-transform'
          >
            Tickets
          </button>
        </div>
      ))}
    </div>
  );
}

import { Calendar, Disc, FileText, Mail, Music, Youtube } from 'lucide-react';

function ContactMockup() {
  const contacts = [
    { role: 'Management', name: 'Sarah Kim', icon: Mail },
    { role: 'Booking', name: 'Marcus Dean', icon: Calendar },
    { role: 'Publicist', name: 'Ava Chen', icon: FileText },
  ];
  return (
    <div className='flex flex-col gap-2'>
      {contacts.map(c => {
        const Icon = c.icon;
        return (
          <div
            key={c.role}
            className='flex items-center gap-3 p-3 rounded-xl transition-colors hover:bg-[var(--linear-bg-hover)] cursor-pointer group bg-[var(--linear-bg-surface-0)] border border-[var(--linear-border-subtle)]'
          >
            <div className='w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--linear-bg-surface-1)]'>
              <Icon className='w-4 h-4 text-[var(--linear-text-tertiary)] group-hover:text-[var(--linear-text-primary)] transition-colors' />
            </div>
            <div className='flex flex-col flex-1'>
              <span className='text-[var(--linear-text-primary)] font-[var(--linear-font-weight-medium)] text-[var(--linear-caption-size)]'>
                {c.role}
              </span>
              <span className='text-[var(--linear-text-tertiary)] text-[var(--linear-label-size)]'>
                {c.name}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ListenMockup() {
  const dsps = [
    { name: 'Spotify', icon: Disc, color: '#1DB954' },
    { name: 'Apple Music', icon: Music, color: '#FA243C' },
    { name: 'YouTube', icon: Youtube, color: '#FF0000' },
  ];
  return (
    <div className='flex flex-col gap-2'>
      {dsps.map(dsp => {
        const Icon = dsp.icon;
        return (
          <div
            key={dsp.name}
            className='flex items-center justify-between p-3 rounded-xl transition-colors hover:bg-[var(--linear-bg-hover)] cursor-pointer group bg-[var(--linear-bg-surface-0)] border border-[var(--linear-border-subtle)]'
          >
            <div className='flex items-center gap-3'>
              <div className='w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--linear-bg-surface-1)]'>
                <Icon className='w-4 h-4' style={{ color: dsp.color }} />
              </div>
              <span className='text-[var(--linear-text-primary)] font-[var(--linear-font-weight-medium)] text-[var(--linear-caption-size)]'>
                {dsp.name}
              </span>
            </div>
            <button
              type='button'
              className='px-4 py-1.5 rounded-full text-[12px] font-medium bg-[var(--linear-bg-surface-2)] text-[var(--linear-text-primary)] hover:bg-[var(--linear-bg-hover)] transition-colors'
            >
              Play
            </button>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Card data                                                          */
/* ------------------------------------------------------------------ */

interface CardData {
  slugPath: string;
  description: string;
  mockup: ReactNode;
}

const cards: CardData[] = [
  {
    slugPath: 'tip',
    description: 'QR on merch table. Fans tip in one tap.',
    mockup: <TipMockup />,
  },
  {
    slugPath: 'tour',
    description: 'Drop in your story. Fans see dates instantly.',
    mockup: <TourMockup />,
  },
  {
    slugPath: 'contact',
    description: 'One link for every industry inquiry.',
    mockup: <ContactMockup />,
  },
  {
    slugPath: 'listen',
    description: 'Skip the profile. Opens their preferred DSP.',
    mockup: <ListenMockup />,
  },
];

/* ------------------------------------------------------------------ */
/*  Main component                                                    */
/* ------------------------------------------------------------------ */

export function DeeplinksGrid() {
  return (
    <section className='section-spacing-linear relative overflow-hidden bg-[var(--linear-bg-page)]'>
      {/* Ambient glow behind grid — matches Linear's 400x400 radial glow pattern */}
      <div
        aria-hidden='true'
        className='pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'
        style={{
          width: '400px',
          height: '400px',
          borderRadius: '400px',
          background: 'var(--linear-hero-glow)',
        }}
      />

      <Container size='homepage'>
        {/* Heading */}
        <div className='text-center heading-gap-linear'>
          <h2 className='marketing-h2-linear text-[var(--linear-text-primary)]'>
            One link.{' '}
            <span className='text-[var(--linear-text-tertiary)]'>
              Infinite outcomes.
            </span>
          </h2>
          <p className='mx-auto mt-4 max-w-[460px] marketing-lead-linear text-[var(--linear-text-secondary)]'>
            Jovie automatically routes fans to the right action — or override
            with a direct link to tips, tours, contacts, and every release.
          </p>
        </div>

        {/* Card grid — 1px border-gap technique */}
        <div
          className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 overflow-hidden bg-[var(--linear-border-subtle)] gap-px rounded-[var(--linear-radius-lg)] border border-[var(--linear-border-subtle)]'
          style={{
            boxShadow: 'var(--linear-shadow-card)',
          }}
        >
          {cards.map(card => (
            <div
              key={card.slugPath}
              className='group relative flex flex-col bg-[var(--linear-bg-surface-1)]'
            >
              <div className='flex flex-1 flex-col gap-4 p-6'>
                {/* URL slug */}
                <p className='font-mono text-[var(--linear-caption-size)] font-[450] text-[var(--linear-text-tertiary)]'>
                  {'jov.ie/tim/'}
                  <span className='text-[var(--linear-text-primary)]'>
                    {card.slugPath}
                  </span>
                </p>

                {/* Description */}
                <p className='text-[var(--linear-body-sm-size)] leading-[var(--linear-leading-normal)] text-[var(--linear-text-secondary)]'>
                  {card.description}
                </p>

                {/* Mockup UI */}
                <div className='mt-auto pt-2'>{card.mockup}</div>
              </div>

              {/* Bottom accent line on hover */}
              <div
                className='absolute bottom-0 left-[15%] h-px w-[70%] opacity-0 transition-opacity duration-200 group-hover:opacity-30'
                style={{
                  background:
                    'linear-gradient(90deg, transparent, var(--linear-text-primary), transparent)',
                }}
              />
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
