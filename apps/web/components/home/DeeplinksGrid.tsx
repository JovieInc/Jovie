import type { ReactNode } from 'react';
import { IGComparisonAside } from '@/components/home/IGComparisonAside';
import { Container } from '@/components/site/Container';

/* ------------------------------------------------------------------ */
/*  Card mockups                                                       */
/* ------------------------------------------------------------------ */

function TipMockup() {
  return (
    <div className='flex flex-col gap-2'>
      <div className='flex gap-1.5'>
        {['$3', '$5', '$10'].map(amt => (
          <div
            key={amt}
            className='flex items-center justify-center rounded-md px-3 py-1.5 text-xs font-medium'
            style={{
              backgroundColor:
                amt === '$10'
                  ? 'var(--linear-bg-surface-2)'
                  : 'var(--linear-bg-surface-1)',
              color: 'var(--linear-text-primary)',
              border:
                amt === '$10'
                  ? '1px solid var(--linear-border-default)'
                  : '1px solid transparent',
            }}
          >
            {amt}
          </div>
        ))}
      </div>
      <div className='flex gap-1.5'>
        <div
          className='flex items-center justify-center rounded-full px-3 py-1.5 text-xs font-medium flex-1'
          style={{
            backgroundColor: '#008CFF',
            color: '#fff',
          }}
        >
          Venmo
        </div>
        <div
          className='flex items-center justify-center rounded-full px-3 py-1.5 text-xs font-medium flex-1'
          style={{
            backgroundColor: '#fff',
            color: '#000',
          }}
        >
          Apple Pay
        </div>
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
    <div className='flex flex-col'>
      {shows.map((show, i) => (
        <div
          key={show.city}
          className='flex items-center justify-between py-2 text-xs'
          style={{
            borderBottom:
              i < shows.length - 1
                ? '1px solid var(--linear-border-subtle)'
                : undefined,
          }}
        >
          <div>
            <span style={{ color: 'var(--linear-text-secondary)' }}>
              {show.city}
            </span>
            <span style={{ color: 'var(--linear-text-tertiary)' }}>
              {' '}
              · {show.venue} · {show.date}
            </span>
          </div>
          <span
            style={{
              color: 'var(--linear-text-tertiary)',
              fontSize: '14px',
            }}
          >
            →
          </span>
        </div>
      ))}
    </div>
  );
}

function ContactMockup() {
  const contacts = [
    { role: 'Management', name: 'Sarah Kim' },
    { role: 'Booking', name: 'Marcus Dean' },
    { role: 'Publicist', name: 'Ava Chen' },
  ];
  return (
    <div className='flex flex-col'>
      {contacts.map((c, i) => (
        <div
          key={c.role}
          className='flex items-center gap-2 py-2 text-xs'
          style={{
            borderBottom:
              i < contacts.length - 1
                ? '1px solid var(--linear-border-subtle)'
                : undefined,
          }}
        >
          <span style={{ color: 'var(--linear-text-tertiary)' }}>{c.role}</span>
          <span style={{ color: 'var(--linear-text-secondary)' }}>
            {c.name}
          </span>
        </div>
      ))}
    </div>
  );
}

function ListenMockup() {
  const dsps = ['Spotify', 'Apple Music', 'YouTube Music', 'Tidal'];
  return (
    <div className='flex flex-col'>
      {dsps.map((name, i) => (
        <div
          key={name}
          className='flex items-center justify-between py-2 text-xs'
          style={{
            borderBottom:
              i < dsps.length - 1
                ? '1px solid var(--linear-border-subtle)'
                : undefined,
          }}
        >
          <span style={{ color: 'var(--linear-text-secondary)' }}>{name}</span>
          <span
            style={{
              color: 'var(--linear-text-tertiary)',
              fontSize: '11px',
              fontWeight: 500,
            }}
          >
            Open →
          </span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Card data                                                          */
/* ------------------------------------------------------------------ */

interface CardData {
  slugBase: string;
  slugPath: string;
  description: string;
  accent: string;
  mockup: ReactNode;
}

const cards: CardData[] = [
  {
    slugBase: 'jov.ie/tim/',
    slugPath: 'tip',
    description: 'QR on merch table. Fans tip in one tap.',
    accent: '#4ade80',
    mockup: <TipMockup />,
  },
  {
    slugBase: 'jov.ie/tim/',
    slugPath: 'tour',
    description: 'Drop in your story. Fans see dates instantly.',
    accent: '#8b5cf6',
    mockup: <TourMockup />,
  },
  {
    slugBase: 'jov.ie/tim/',
    slugPath: 'contact',
    description: 'One link for every industry inquiry.',
    accent: '#3b82f6',
    mockup: <ContactMockup />,
  },
  {
    slugBase: 'jov.ie/tim/',
    slugPath: 'listen',
    description: 'Skip the profile. Opens their preferred DSP.',
    accent: '#4ade80',
    mockup: <ListenMockup />,
  },
];

/* ------------------------------------------------------------------ */
/*  Main component                                                    */
/* ------------------------------------------------------------------ */

export function DeeplinksGrid() {
  return (
    <section
      className='section-spacing-linear'
      style={{
        backgroundColor: 'var(--linear-bg-page)',
        borderTop: '1px solid var(--linear-border-subtle)',
      }}
    >
      <Container size='homepage'>
        <div className='text-center heading-gap-linear'>
          <h2
            style={{
              fontSize: 'var(--linear-h2-size)',
              fontWeight: 'var(--linear-font-weight-bold)',
              lineHeight: 'var(--linear-h2-leading)',
              letterSpacing: 'var(--linear-h2-tracking)',
              color: 'var(--linear-text-primary)',
            }}
          >
            One link.{' '}
            <span style={{ color: 'var(--linear-text-tertiary)' }}>
              Five destinations.
            </span>
          </h2>
        </div>

        <div
          className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 overflow-hidden'
          style={{
            backgroundColor: 'var(--linear-border-subtle)',
            gap: '1px',
            borderRadius: '12px',
          }}
        >
          {cards.map(card => (
            <div key={card.slugPath} className='group relative flex flex-col'>
              <div
                className='flex flex-1 flex-col gap-3 p-5'
                style={{
                  backgroundColor: 'var(--linear-bg-surface-0)',
                }}
              >
                <div>
                  <p
                    className='font-mono text-sm'
                    style={{ color: 'var(--linear-text-tertiary)' }}
                  >
                    {card.slugBase}
                    <span style={{ color: 'var(--linear-text-secondary)' }}>
                      {card.slugPath}
                    </span>
                  </p>
                  <p
                    className='mt-1'
                    style={{
                      fontSize: 'var(--linear-body-sm-size)',
                      lineHeight: 'var(--linear-body-sm-leading)',
                      color: 'var(--linear-text-secondary)',
                    }}
                  >
                    {card.description}
                  </p>
                </div>
                <div className='mt-auto'>{card.mockup}</div>
              </div>
              {/* Hover accent line — gradient, centered 60% width */}
              <div
                className='absolute bottom-0 left-[20%] h-0.5 w-[60%] opacity-0 transition-opacity duration-200 group-hover:opacity-40'
                style={{
                  background: `linear-gradient(90deg, transparent, ${card.accent}, transparent)`,
                }}
              />
            </div>
          ))}
        </div>

        {/* IG Comparison Aside */}
        <IGComparisonAside />
      </Container>
    </section>
  );
}
