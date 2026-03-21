'use client';

import { Calendar, Disc, FileText, Mail, Music, Youtube } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { Container } from '@/components/site/Container';
import { PhoneFrame } from './PhoneFrame';
import { TIM_WHITE_PROFILE } from './tim-white';

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
  name: TIM_WHITE_PROFILE.name,
  handle: '@timwhite',
  tagline: 'Never Say A Word out now. Tour announced.',
  avatarSrc: TIM_WHITE_PROFILE.avatarSrc,
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
            className='flex items-center justify-between rounded-[0.9rem] border border-white/[0.06] bg-white/[0.04] p-2.5'
          >
            <div className='flex items-center gap-2.5'>
              <div className='flex h-7 w-7 items-center justify-center rounded-[0.7rem] bg-white/[0.06]'>
                <Icon className='w-3.5 h-3.5' style={{ color: dsp.color }} />
              </div>
              <span className='text-[13px] font-medium text-white/90'>
                {dsp.name}
              </span>
            </div>
            <span className='rounded-full bg-white px-3 py-1 text-[11px] font-medium text-black'>
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
            className={`flex aspect-square flex-col items-center justify-center gap-0.5 rounded-[0.9rem] ${
              amt === '$5'
                ? 'bg-primary-token text-page border border-transparent'
                : 'bg-white/[0.04] text-primary-token border border-white/[0.06]'
            }`}
          >
            <span
              className={`text-[9px] font-medium uppercase tracking-wider ${
                amt === '$5' ? 'text-black/50' : 'text-white/40'
              }`}
            >
              USD
            </span>
            <span className='text-xl font-semibold tabular-nums tracking-tight'>
              {amt}
            </span>
          </div>
        ))}
      </div>
      <div className='mt-1 flex items-center justify-center rounded-[0.9rem] bg-white px-4 py-2.5 text-[13px] font-medium text-black'>
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
          className='flex items-center justify-between rounded-[0.9rem] border border-white/[0.06] bg-white/[0.04] p-2.5'
        >
          <div className='flex flex-col gap-0.5'>
            <span className='text-[13px] font-medium text-white/90'>
              {show.city}
            </span>
            <span className='text-[11px] text-white/40'>
              {show.date} · {show.venue}
            </span>
          </div>
          <span className='rounded-full bg-white px-3 py-1 text-[11px] font-medium text-black'>
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
            className='flex items-center gap-2.5 rounded-[0.9rem] border border-white/[0.06] bg-white/[0.04] p-2.5'
          >
            <div className='flex h-7 w-7 items-center justify-center rounded-[0.7rem] bg-white/[0.06]'>
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
      id='profiles'
      ref={sectionRef}
      className='section-spacing-linear overflow-hidden'
      style={{ backgroundColor: 'var(--linear-bg-page)' }}
    >
      <Container size='homepage'>
        <div className='mx-auto max-w-[var(--linear-content-max)]'>
          <div className='grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-12'>
            <div className='reveal-on-scroll order-2 lg:order-1'>
              <p className='inline-flex w-fit items-center rounded-full border border-subtle bg-surface-1 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-secondary-token backdrop-blur'>
                Smart profile
              </p>
              <h2 className='mt-4 max-w-[9ch] marketing-h2-linear text-primary-token'>
                Profiles that convert.
              </h2>
              <p className='mt-4 max-w-[30rem] marketing-lead-linear text-secondary-token'>
                Your artist page handles streaming, tips, tour dates, and fan
                capture in one place. It looks polished, updates fast, and gives
                every release a home.
              </p>
              <div className='mt-6 grid gap-3 sm:grid-cols-3 lg:max-w-[24rem] lg:grid-cols-1'>
                <div className='rounded-[0.95rem] border border-subtle bg-surface-0 px-4 py-4'>
                  <p className='text-[11px] uppercase tracking-[0.08em] text-quaternary-token'>
                    Streaming
                  </p>
                  <p className='mt-1 text-sm font-medium text-primary-token'>
                    One clean page for every link out.
                  </p>
                </div>
                <div className='rounded-[0.95rem] border border-subtle bg-surface-0 px-4 py-4'>
                  <p className='text-[11px] uppercase tracking-[0.08em] text-quaternary-token'>
                    Fan capture
                  </p>
                  <p className='mt-1 text-sm font-medium text-primary-token'>
                    Collect emails without extra tooling.
                  </p>
                </div>
                <div className='rounded-[0.95rem] border border-subtle bg-surface-0 px-4 py-4'>
                  <p className='text-[11px] uppercase tracking-[0.08em] text-quaternary-token'>
                    Monetization
                  </p>
                  <p className='mt-1 text-sm font-medium text-primary-token'>
                    Tips, tickets, and launch traffic in one flow.
                  </p>
                </div>
              </div>
            </div>

            <div
              className='order-1 flex justify-center lg:order-2 lg:justify-end'
              style={{
                transform: isVisible ? 'translateY(0)' : 'translateY(40px)',
                opacity: isVisible ? 1 : 0,
                transition:
                  'transform 0.7s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.7s ease-out',
              }}
            >
              <div className='lg:translate-x-2'>
                <PhoneFrame>
                  {/* Profile header */}
                  <div className='flex flex-col items-center px-5 pb-4 pt-10'>
                    <div className='h-14 w-14 overflow-hidden rounded-full border border-white/10'>
                      <Image
                        src={PROFILE.avatarSrc}
                        alt='Tim White'
                        width={112}
                        height={112}
                        className='h-full w-full object-cover'
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

                  <div className='relative mx-4 flex overflow-hidden rounded-[0.85rem] border border-white/[0.05] bg-white/[0.04]'>
                    <span
                      aria-hidden='true'
                      className='absolute inset-y-0 left-0 rounded-[0.75rem] bg-white/[0.08]'
                      style={{
                        width: `${100 / TABS.length}%`,
                        transform: `translateX(${TABS.findIndex(t => t.id === activeTab) * 100}%)`,
                        transition:
                          'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                      }}
                    />
                    {TABS.map(tab => (
                      <button
                        key={tab.id}
                        type='button'
                        onClick={() => setActiveTab(tab.id)}
                        className={`relative z-10 flex-1 py-2 text-center text-[11px] font-medium transition-colors ${
                          tab.id === activeTab
                            ? 'text-primary-token'
                            : 'text-white/40'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div
                    className='overflow-y-auto px-5 pb-6 pt-4'
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
          </div>
        </div>
      </Container>
    </section>
  );
}
