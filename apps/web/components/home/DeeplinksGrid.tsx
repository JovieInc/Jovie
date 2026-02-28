import type { ReactNode } from 'react';
import { Container } from '@/components/site/Container';

/* ------------------------------------------------------------------ */
/*  Card mockups — premium fidelity                                    */
/* ------------------------------------------------------------------ */

function TipMockup() {
  return (
    <div className='flex flex-col gap-3'>
      <p className='text-xs font-medium uppercase tracking-[0.15em] text-[var(--linear-text-tertiary)]'>
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
                  : 'rgba(255,255,255,0.03)',
              color:
                amt === '$5'
                  ? 'var(--linear-bg-page)'
                  : 'var(--linear-text-primary)',
              border:
                amt === '$5'
                  ? '1px solid transparent'
                  : '1px solid rgba(255,255,255,0.10)',
              boxShadow: amt === '$5' ? '0 2px 4px rgba(0,0,0,0.2)' : 'none',
            }}
          >
            <span
              className='text-[10px] font-medium uppercase tracking-wider'
              style={{
                color:
                  amt === '$5'
                    ? 'rgba(0,0,0,0.6)'
                    : 'var(--linear-text-tertiary)',
              }}
            >
              USD
            </span>
            <span className='text-2xl font-semibold tabular-nums tracking-tight'>
              {amt}
            </span>
          </div>
        ))}
      </div>
      <div
        className='flex items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold w-full mt-1'
        style={{
          backgroundColor: 'var(--linear-text-primary)',
          color: 'var(--linear-bg-page)',
          boxShadow: '0 2px 10px rgba(255,255,255,0.15)',
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
          className='flex items-center justify-between p-3 rounded-xl transition-colors hover:bg-surface-2 cursor-pointer group'
          style={{
            backgroundColor: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div className='flex flex-col gap-0.5'>
            <span
              style={{
                color: 'var(--linear-text-primary)',
                fontWeight: 500,
                fontSize: '13px',
                tracking: 'tight',
              }}
            >
              {show.city}
            </span>
            <span
              style={{ color: 'var(--linear-text-tertiary)', fontSize: '12px' }}
            >
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
            className='flex items-center gap-3 p-3 rounded-xl transition-colors hover:bg-surface-2 cursor-pointer group'
            style={{
              backgroundColor: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div
              className='w-8 h-8 rounded-lg flex items-center justify-center'
              style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
            >
              <Icon className='w-4 h-4 text-[var(--linear-text-tertiary)] group-hover:text-[var(--linear-text-primary)] transition-colors' />
            </div>
            <div className='flex flex-col flex-1'>
              <span
                style={{
                  color: 'var(--linear-text-primary)',
                  fontWeight: 500,
                  fontSize: '13px',
                }}
              >
                {c.role}
              </span>
              <span
                style={{
                  color: 'var(--linear-text-tertiary)',
                  fontSize: '12px',
                }}
              >
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
            className='flex items-center justify-between p-3 rounded-xl transition-colors hover:bg-surface-2 cursor-pointer group'
            style={{
              backgroundColor: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div className='flex items-center gap-3'>
              <div
                className='w-8 h-8 rounded-lg flex items-center justify-center'
                style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
              >
                <Icon className='w-4 h-4' style={{ color: dsp.color }} />
              </div>
              <span
                style={{
                  color: 'var(--linear-text-primary)',
                  fontWeight: 500,
                  fontSize: '13px',
                }}
              >
                {dsp.name}
              </span>
            </div>
            <button
              type='button'
              className='px-4 py-1.5 rounded-full text-[12px] font-medium bg-[rgba(255,255,255,0.05)] text-[var(--linear-text-primary)] hover:bg-[rgba(255,255,255,0.1)] transition-colors'
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
    <section
      className='section-spacing-linear relative overflow-hidden'
      style={{
        backgroundColor: 'var(--linear-bg-page)',
      }}
    >
      {/* Ambient glow behind grid — matches Linear's 400x400 radial glow pattern */}
      <div
        aria-hidden='true'
        className='pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'
        style={{
          width: '400px',
          height: '400px',
          borderRadius: '400px',
          background:
            'radial-gradient(50% 50%, rgba(255,255,255,0.03) 0%, rgba(0,0,0,0) 50%)',
        }}
      />

      <Container size='homepage'>
        {/* Heading */}
        <div className='text-center heading-gap-linear'>
          <h2
            style={{
              fontSize: 'clamp(28px, 4vw, 48px)',
              fontWeight: 510,
              lineHeight: 1,
              letterSpacing: '-0.022em',
              color: 'var(--linear-text-primary)',
            }}
          >
            One link.{' '}
            <span style={{ color: 'var(--linear-text-tertiary)' }}>
              Infinite outcomes.
            </span>
          </h2>
          <p
            className='mx-auto mt-4'
            style={{
              fontSize: '15px',
              lineHeight: '24px',
              letterSpacing: '-0.011em',
              color: 'var(--linear-text-secondary)',
              maxWidth: '460px',
            }}
          >
            Jovie automatically routes fans to the right action — or override
            with a direct link to tips, tours, contacts, and every release.
          </p>
        </div>

        {/* Card grid — 1px border-gap technique */}
        <div
          className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 overflow-hidden'
          style={{
            backgroundColor: 'rgba(255,255,255,0.08)',
            gap: '1px',
            borderRadius: '12px',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 4px 32px rgba(8,9,10,0.6)',
          }}
        >
          {cards.map(card => (
            <div
              key={card.slugPath}
              className='group relative flex flex-col'
              style={{ backgroundColor: 'var(--linear-bg-surface-0)' }}
            >
              <div className='flex flex-1 flex-col gap-4 p-6'>
                {/* URL slug */}
                <p
                  className='font-mono'
                  style={{
                    fontSize: '13px',
                    fontWeight: 450,
                    color: 'var(--linear-text-tertiary)',
                  }}
                >
                  {'jov.ie/tim/'}
                  <span style={{ color: 'var(--linear-text-primary)' }}>
                    {card.slugPath}
                  </span>
                </p>

                {/* Description */}
                <p
                  style={{
                    fontSize: '14px',
                    lineHeight: 1.55,
                    color: 'var(--linear-text-secondary)',
                  }}
                >
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
                    'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
                }}
              />
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
