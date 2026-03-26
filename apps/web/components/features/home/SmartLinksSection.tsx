import { Bell, Link2, Zap } from 'lucide-react';
import Image from 'next/image';
import { FigCard } from '@/components/marketing';
import { Container } from '@/components/site/Container';

export function SmartLinksSection() {
  return (
    <section className='section-glow section-spacing-linear'>
      <Container size='homepage'>
        <div className='mx-auto max-w-[var(--linear-content-max)]'>
          <div className='grid items-center gap-10 lg:grid-cols-2 lg:gap-16'>
            {/* Text + cards */}
            <div className='reveal-on-scroll'>
              <p className='homepage-section-eyebrow'>Smart Links</p>
              <h2 className='marketing-h2-linear mt-5 text-primary-token'>
                New release? Already live.
              </h2>
              <p className='marketing-lead-linear mt-4 max-w-[420px] text-secondary-token'>
                Every time you drop, smart links go live across every streaming
                platform — no setup, no copy-pasting URLs. Just release and go.
              </p>

              <div className='mt-8 flex flex-col gap-3'>
                <FigCard
                  title='Auto-generated smart links'
                  description='Every release gets a smart link across Spotify, Apple Music, YouTube, and more — instantly.'
                  icon={<Link2 className='h-5 w-5' />}
                />
                <FigCard
                  title='Pre-save pages that convert'
                  description='Turn anticipation into day-one streams with pre-save pages that capture fans before the drop.'
                  icon={<Zap className='h-5 w-5' />}
                />
                <FigCard
                  title='Instant fan notifications'
                  description='Fans get notified via email the moment your music goes live — no manual blasts needed.'
                  icon={<Bell className='h-5 w-5' />}
                />
              </div>
            </div>

            {/* Visual */}
            <div
              className='reveal-on-scroll overflow-hidden rounded-xl'
              data-delay='80'
            >
              <div
                aria-hidden='true'
                className='pointer-events-none absolute inset-x-0 top-0 z-10 h-px'
                style={{
                  background:
                    'linear-gradient(90deg, transparent, rgba(255,255,255,0.08) 30%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.08) 70%, transparent)',
                }}
              />
              <Image
                src='/product-screenshots/release-sidebar-detail.png'
                alt='Jovie release detail showing streaming links across Spotify, Apple Music, and more'
                width={1440}
                height={1800}
                className='w-full rounded-xl border border-subtle'
                sizes='(min-width: 1024px) 50vw, 100vw'
              />
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
