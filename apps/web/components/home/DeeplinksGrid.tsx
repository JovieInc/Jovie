import type { ReactNode } from 'react';
import { Container } from '@/components/site/Container';

/* ------------------------------------------------------------------ */
/*  Card mockups — premium fidelity                                    */
/* ------------------------------------------------------------------ */

function TipMockup() {
  return (
    <div className='flex flex-col gap-3'>
      <div className='flex gap-2'>
        {['$3', '$5', '$10'].map(amt => (
          <div
            key={amt}
            className='flex items-center justify-center rounded-lg px-4 py-2 text-xs font-medium transition-colors duration-100'
            style={{
              backgroundColor:
                amt === '$10'
                  ? 'rgba(255,255,255,0.08)'
                  : 'rgba(255,255,255,0.03)',
              color: 'var(--linear-text-primary)',
              border:
                amt === '$10'
                  ? '1px solid rgba(255,255,255,0.10)'
                  : '1px solid rgba(255,255,255,0.05)',
            }}
          >
            {amt}
          </div>
        ))}
      </div>
      <div className='flex gap-2'>
        <div
          className='flex items-center justify-center rounded-full px-4 py-2 text-xs font-medium flex-1'
          style={{ backgroundColor: '#008CFF', color: '#fff' }}
        >
          Venmo
        </div>
        <div
          className='flex items-center justify-center rounded-full px-4 py-2 text-xs font-medium flex-1'
          style={{ backgroundColor: '#fff', color: '#000' }}
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
          className='flex items-center justify-between py-2.5'
          style={{
            borderBottom:
              i < shows.length - 1
                ? '1px solid rgba(255,255,255,0.05)'
                : undefined,
          }}
        >
          <div style={{ fontSize: '12px', lineHeight: 1.4 }}>
            <span
              style={{ color: 'var(--linear-text-secondary)', fontWeight: 450 }}
            >
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
              fontSize: '13px',
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
          className='flex items-center justify-between py-2.5'
          style={{
            borderBottom:
              i < contacts.length - 1
                ? '1px solid rgba(255,255,255,0.05)'
                : undefined,
            fontSize: '12px',
          }}
        >
          <span
            style={{ color: 'var(--linear-text-tertiary)', fontWeight: 450 }}
          >
            {c.role}
          </span>
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
          className='flex items-center justify-between py-2.5'
          style={{
            borderBottom:
              i < dsps.length - 1
                ? '1px solid rgba(255,255,255,0.05)'
                : undefined,
            fontSize: '12px',
          }}
        >
          <span
            style={{ color: 'var(--linear-text-secondary)', fontWeight: 450 }}
          >
            {name}
          </span>
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
                  jov.ie/tim/
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
