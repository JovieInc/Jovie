'use client';

import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { Container } from '@/components/site/Container';

const FAQ_ITEMS = [
  {
    q: 'Is Jovie really free?',
    a: 'Yes. The free plan includes unlimited smart links, auto-sync from Spotify, a public artist profile, and basic analytics. No credit card required, no time limit.',
  },
  {
    q: 'How do smart links work?',
    a: 'When you release music on any distributor, Jovie automatically detects it and creates a smart link that routes fans to Spotify, Apple Music, YouTube Music, and every other streaming platform — instantly.',
  },
  {
    q: 'Do I need a distributor?',
    a: "Yes — Jovie works with your existing distributor (DistroKid, TuneCore, CD Baby, AWAL, etc.). We don't distribute music; we handle everything that happens after distribution.",
  },
  {
    q: 'What makes Jovie different from Linkfire or Linktree?',
    a: 'Jovie is purpose-built for music releases, not generic links. Smart links are auto-generated for every release, your profile updates itself, and the audience CRM tracks who your fans actually are — not just click counts.',
  },
  {
    q: 'Can I use my own domain?',
    a: 'Yes. Pro plans include custom domain support so your smart links and profile live on your own URL.',
  },
] as const;

function FAQItem({ item }: { readonly item: (typeof FAQ_ITEMS)[number] }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className='border-b py-5'
      style={{ borderColor: 'rgba(255,255,255,0.06)' }}
    >
      <button
        type='button'
        onClick={() => setOpen(!open)}
        className='flex w-full items-center justify-between text-left'
      >
        <span className='text-[15px] font-medium text-primary-token'>
          {item.q}
        </span>
        <ChevronDown
          className='h-4 w-4 flex-shrink-0 text-tertiary-token transition-transform duration-200'
          style={{ transform: open ? 'rotate(180deg)' : undefined }}
        />
      </button>
      <div
        className='grid transition-all duration-200'
        style={{
          gridTemplateRows: open ? '1fr' : '0fr',
          opacity: open ? 1 : 0,
        }}
      >
        <div className='overflow-hidden'>
          <p className='pt-3 text-sm leading-relaxed text-secondary-token'>
            {item.a}
          </p>
        </div>
      </div>
    </div>
  );
}

export function HomeFAQSection() {
  return (
    <section className='section-spacing-linear'>
      <Container size='homepage'>
        <div className='mx-auto max-w-[640px]'>
          <div className='reveal-on-scroll mb-10 text-center'>
            <h2 className='marketing-h2-linear text-primary-token'>
              Frequently asked questions
            </h2>
          </div>

          <div className='reveal-on-scroll' data-delay='80'>
            {FAQ_ITEMS.map(item => (
              <FAQItem key={item.q} item={item} />
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
