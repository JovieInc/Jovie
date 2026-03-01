'use client';

import { Calendar, Disc, FileText, Mail, Music, Youtube } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { Container } from '@/components/site/Container';
import { PhoneFrame } from './PhoneFrame';

/* ------------------------------------------------------------------ */
/*  Types & constants                                                  */
/* ------------------------------------------------------------------ */

type ProfileTab = 'listen' | 'tip' | 'tour' | 'contact';

const TABS: ReadonlyArray<{ id: ProfileTab; label: string }> = [
  { id: 'listen', label: 'Listen' },
  { id: 'tip', label: 'Tip' },
  { id: 'tour', label: 'Tour' },
  { id: 'contact', label: 'Contact' },
];

const PROFILE = {
  name: 'Mara Vale',
  handle: '@maravale',
  tagline: 'New single out now. Tour announced.',
} as const;

/* ------------------------------------------------------------------ */
/*  Tab content mockups                                                */
/* ------------------------------------------------------------------ */

function ListenContent() {
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
            className='flex items-center justify-between p-2.5 rounded-xl'
            style={{
              backgroundColor: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div className='flex items-center gap-2.5'>
              <div
                className='w-7 h-7 rounded-lg flex items-center justify-center'
                style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
              >
                <Icon className='w-3.5 h-3.5' style={{ color: dsp.color }} />
              </div>
              <span className='text-[13px] font-medium text-white/90'>
                {dsp.name}
              </span>
            </div>
            <span className='px-3 py-1 rounded-full text-[11px] font-medium bg-white text-black'>
              Play
            </span>
          </div>
        );
      })}
    </div>
  );
}

function TipContent() {
  return (
    <div className='flex flex-col gap-2.5'>
      <p className='text-[10px] font-medium uppercase tracking-[0.15em] text-white/40'>
        Choose amount
      </p>
      <div className='grid grid-cols-3 gap-2'>
        {['$3', '$5', '$10'].map(amt => (
          <div
            key={amt}
            className='aspect-square rounded-xl flex flex-col items-center justify-center gap-0.5'
            style={{
              backgroundColor:
                amt === '$5' ? 'rgb(247,248,248)' : 'rgba(255,255,255,0.04)',
              color: amt === '$5' ? 'rgb(8,9,10)' : 'rgb(247,248,248)',
              border:
                amt === '$5'
                  ? '1px solid transparent'
                  : '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <span
              className='text-[9px] font-medium uppercase tracking-wider'
              style={{
                color:
                  amt === '$5' ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.4)',
              }}
            >
              USD
            </span>
            <span className='text-xl font-semibold tabular-nums tracking-tight'>
              {amt}
            </span>
          </div>
        ))}
      </div>
      <div className='flex items-center justify-center rounded-xl px-4 py-2.5 text-[13px] font-medium bg-white text-black mt-1'>
        Continue with Venmo
      </div>
    </div>
  );
}

function TourContent() {
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
          className='flex items-center justify-between p-2.5 rounded-xl'
          style={{
            backgroundColor: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div className='flex flex-col gap-0.5'>
            <span className='text-[13px] font-medium text-white/90'>
              {show.city}
            </span>
            <span className='text-[11px] text-white/40'>
              {show.date} · {show.venue}
            </span>
          </div>
          <span className='px-3 py-1 rounded-full text-[11px] font-medium bg-white text-black'>
            Tickets
          </span>
        </div>
      ))}
    </div>
  );
}

function ContactContent() {
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
            className='flex items-center gap-2.5 p-2.5 rounded-xl'
            style={{
              backgroundColor: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div
              className='w-7 h-7 rounded-lg flex items-center justify-center'
              style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
            >
              <Icon className='w-3.5 h-3.5 text-white/50' />
            </div>
            <div className='flex flex-col'>
              <span className='text-[13px] font-medium text-white/90'>
                {c.role}
              </span>
              <span className='text-[11px] text-white/40'>{c.name}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const TAB_CONTENT: Record<ProfileTab, React.ReactNode> = {
  listen: <ListenContent />,
  tip: <TipContent />,
  tour: <TourContent />,
  contact: <ContactContent />,
};

/* ------------------------------------------------------------------ */
/*  Main component                                                    */
/* ------------------------------------------------------------------ */

export function PhoneProfileDemo() {
  const [activeTab, setActiveTab] = useState<ProfileTab>('listen');
  const sectionRef = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  // Intersection Observer for entrance animation
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      className='section-spacing-linear overflow-hidden'
      style={{ backgroundColor: 'var(--linear-bg-page)' }}
    >
      <Container size='homepage'>
        <div className='mx-auto max-w-[var(--linear-content-max)]'>
          {/* Section heading */}
          <div className='text-center heading-gap-linear'>
            <p className='inline-flex w-fit items-center rounded-full border border-[var(--linear-border-subtle)] bg-[var(--linear-bg-surface-1)] px-2.5 py-1 text-[10px] font-medium tracking-wide uppercase text-[var(--linear-text-secondary)] backdrop-blur mx-auto'>
              Link in bio
            </p>
            <h2 className='mt-4 marketing-h2-linear text-[var(--linear-text-primary)]'>
              One profile. Adapts to every fan.
            </h2>
            <p className='mx-auto mt-4 max-w-[460px] marketing-lead-linear text-[var(--linear-text-secondary)]'>
              Opinionated by design. Your link instantly adapts to a fan&apos;s
              location, preferred music app, and notification status. Jovie
              handles the optimization and retargeting so you can focus on the
              music.
            </p>
          </div>

          {/* Phone mockup */}
          <div
            className='flex justify-center mt-12 lg:mt-16'
            style={{
              transform: isVisible ? 'translateY(0)' : 'translateY(40px)',
              opacity: isVisible ? 1 : 0,
              transition:
                'transform 0.7s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.7s ease-out',
            }}
          >
            <PhoneFrame>
              {/* Profile header */}
              <div className='flex flex-col items-center pt-10 pb-4 px-5'>
                <div className='w-14 h-14 rounded-full overflow-hidden border border-white/10'>
                  <Image
                    src='/images/avatars/dua-lipa.jpg'
                    alt='Mara Vale'
                    width={112}
                    height={112}
                    className='w-full h-full object-cover'
                    priority={false}
                  />
                </div>
                <p className='mt-2.5 text-[15px] font-semibold text-white'>
                  {PROFILE.name}
                </p>
                <p className='mt-0.5 text-[11px] text-white/40'>
                  {PROFILE.tagline}
                </p>
              </div>

              {/* Tab bar */}
              <div
                className='relative flex mx-4 rounded-xl overflow-hidden'
                style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
              >
                {/* Sliding indicator */}
                <span
                  aria-hidden='true'
                  className='absolute inset-y-0 left-0 rounded-xl'
                  style={{
                    width: `${100 / TABS.length}%`,
                    transform: `translateX(${TABS.findIndex(t => t.id === activeTab) * 100}%)`,
                    backgroundColor: 'rgba(255,255,255,0.08)',
                    transition: 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                  }}
                />
                {TABS.map(tab => (
                  <button
                    key={tab.id}
                    type='button'
                    onClick={() => setActiveTab(tab.id)}
                    className='relative z-10 flex-1 py-2 text-[11px] font-medium text-center transition-colors'
                    style={{
                      color:
                        tab.id === activeTab
                          ? 'rgb(247,248,248)'
                          : 'rgba(255,255,255,0.4)',
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div
                className='px-5 pt-4 pb-6 overflow-y-auto'
                style={{ flex: 1 }}
              >
                {TABS.map(tab => (
                  <div
                    key={tab.id}
                    style={{
                      display: tab.id === activeTab ? 'block' : 'none',
                    }}
                  >
                    {TAB_CONTENT[tab.id]}
                  </div>
                ))}
              </div>
            </PhoneFrame>
          </div>
        </div>
      </Container>
    </section>
  );
}
