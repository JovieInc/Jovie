import { BadgeCheck, Check, Link2, Search } from 'lucide-react';
import { Container } from '@/components/site/Container';

const steps = [
  {
    number: '01',
    title: 'Paste your Spotify',
    description:
      'Jovie imports your discography, photo, bio, and every release — matched across all major platforms.',
    result: 'Done in 10 seconds',
    accent: '#4ade80',
    accentDim: 'rgba(74, 222, 128, 0.08)',
    accentGlow: 'rgba(74, 222, 128, 0.06)',
  },
  {
    number: '02',
    title: 'Share one link',
    description:
      'Put jov.ie/you in your bio. Every release already has its own smart link. Your profile adapts to each visitor.',
    result: 'Replace your Linktree',
    accent: '#8b5cf6',
    accentDim: 'rgba(139, 92, 246, 0.08)',
    accentGlow: 'rgba(139, 92, 246, 0.06)',
  },
  {
    number: '03',
    title: 'Grow on autopilot',
    description:
      'Non-subscribers get retargeted on Facebook. Subscribers are excluded and notified when you drop new music.',
    result: 'Fans you actually own',
    accent: '#3b82f6',
    accentDim: 'rgba(59, 130, 246, 0.08)',
    accentGlow: 'rgba(59, 130, 246, 0.06)',
  },
] as const;

/* ------------------------------------------------------------------ */
/*  Step 1 mockup — Search bar + result card with import tags          */
/* ------------------------------------------------------------------ */
function SearchMockup() {
  const activePlatforms = ['Spotify', 'Apple Music', 'YouTube', 'Tidal'];
  return (
    <div className='flex flex-col items-center justify-center h-full px-8 py-8'>
      {/* Search bar */}
      <div
        className='w-full max-w-[260px] flex items-center gap-2.5 px-3.5 py-2.5'
        style={{
          backgroundColor: 'var(--linear-bg-surface-1)',
          borderRadius: '8px',
          border: '1px solid var(--linear-border-subtle)',
        }}
      >
        <Search
          aria-hidden='true'
          size={14}
          style={{ color: 'var(--linear-text-tertiary)' }}
        />
        <span
          style={{
            fontSize: '13px',
            color: 'var(--linear-text-primary)',
            fontWeight: 450,
            letterSpacing: '-0.01em',
          }}
        >
          Tim White
        </span>
      </div>

      {/* Result card */}
      <div
        className='w-full max-w-[260px] mt-2 flex items-center gap-3 px-3.5 py-3'
        style={{
          backgroundColor: 'var(--linear-bg-surface-1)',
          borderRadius: '8px',
          border: '1px solid var(--linear-border-subtle)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }}
      >
        {/* Avatar */}
        <div
          className='w-8 h-8 rounded-full shrink-0 flex items-center justify-center'
          style={{
            backgroundColor: 'var(--linear-bg-surface-2)',
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--linear-text-secondary)',
          }}
        >
          T
        </div>
        <div className='flex flex-col min-w-0 flex-1'>
          <span
            style={{
              fontSize: '13px',
              fontWeight: 500,
              color: 'var(--linear-text-primary)',
              letterSpacing: '-0.01em',
            }}
          >
            Tim White
          </span>
          <span
            style={{
              fontSize: '11px',
              color: 'var(--linear-text-tertiary)',
            }}
          >
            Artist · 24 releases
          </span>
        </div>
        {/* Green checkmark */}
        <div
          className='w-5 h-5 rounded-full shrink-0 flex items-center justify-center'
          style={{ backgroundColor: '#4ade80' }}
        >
          <Check
            aria-hidden='true'
            size={12}
            className='text-black'
            strokeWidth={3}
          />
        </div>
      </div>

      {/* Import tags */}
      <div className='w-full max-w-[260px] mt-2.5 flex flex-wrap gap-1.5'>
        {activePlatforms.map(p => (
          <span
            key={p}
            className='px-2 py-0.5'
            style={{
              fontSize: '10px',
              fontWeight: 500,
              color: 'var(--linear-text-secondary)',
              backgroundColor: 'var(--linear-bg-surface-2)',
              borderRadius: '4px',
              border: '1px solid var(--linear-border-subtle)',
            }}
          >
            {p}
          </span>
        ))}
        <span
          className='px-2 py-0.5'
          style={{
            fontSize: '10px',
            fontWeight: 500,
            color: 'var(--linear-text-tertiary)',
            backgroundColor: 'var(--linear-bg-surface-1)',
            borderRadius: '4px',
          }}
        >
          +4 more
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step 2 mockup — Bio card with smart link chips                     */
/* ------------------------------------------------------------------ */
function BioCardMockup() {
  return (
    <div className='flex flex-col items-center justify-center h-full px-8 py-8'>
      <div
        className='w-full max-w-[260px] flex flex-col py-4 px-4'
        style={{
          backgroundColor: 'var(--linear-bg-surface-1)',
          borderRadius: '8px',
          border: '1px solid var(--linear-border-subtle)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }}
      >
        {/* Avatar + name */}
        <div className='flex items-center gap-2.5'>
          <div
            className='w-9 h-9 rounded-full shrink-0 flex items-center justify-center'
            style={{
              backgroundColor: 'var(--linear-bg-surface-2)',
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--linear-text-secondary)',
            }}
          >
            T
          </div>
          <div className='flex flex-col min-w-0'>
            <div className='flex items-center gap-1.5'>
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 500,
                  color: 'var(--linear-text-primary)',
                  letterSpacing: '-0.01em',
                }}
              >
                timwhitemusic
              </span>
              <BadgeCheck
                aria-hidden='true'
                size={14}
                className='fill-blue-500 text-blue-500'
              />
            </div>
            <span
              style={{
                fontSize: '11px',
                color: 'var(--linear-text-tertiary)',
                lineHeight: 1.3,
              }}
            >
              Artist · Producer · DJ
              <br />
              New single out now ↓
            </span>
          </div>
        </div>

        {/* Profile link */}
        <div className='flex items-center gap-1.5 mt-3'>
          <Link2 aria-hidden='true' size={12} className='text-violet-500' />
          <span
            style={{
              fontSize: '12px',
              fontWeight: 500,
              color: '#8b5cf6',
            }}
          >
            jov.ie/tim
          </span>
        </div>

        {/* Smart links section */}
        <div
          className='mt-3 pt-3'
          style={{
            borderTop: '1px solid var(--linear-border-subtle)',
          }}
        >
          <span
            style={{
              fontSize: '10px',
              fontWeight: 500,
              color: 'var(--linear-text-tertiary)',
              textTransform: 'uppercase' as const,
              letterSpacing: '0.04em',
            }}
          >
            Auto-generated smart links
          </span>
          <div className='flex flex-wrap gap-1.5 mt-1.5'>
            <span
              className='px-2 py-0.5'
              style={{
                fontSize: '10px',
                fontWeight: 500,
                color: 'var(--linear-text-secondary)',
                backgroundColor: 'var(--linear-bg-surface-2)',
                borderRadius: '4px',
                border: '1px solid var(--linear-border-subtle)',
              }}
            >
              jov.ie/tim/never-say-a-word
            </span>
            <span
              className='px-2 py-0.5'
              style={{
                fontSize: '10px',
                fontWeight: 500,
                color: 'var(--linear-text-tertiary)',
                backgroundColor: 'var(--linear-bg-surface-1)',
                borderRadius: '4px',
              }}
            >
              +23
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step 3 mockup — Vertical fan flow diagram                          */
/* ------------------------------------------------------------------ */
function FlowMockup() {
  return (
    <div className='flex flex-col items-center justify-center h-full px-8 py-8'>
      <div className='flex flex-col items-center gap-0 w-full max-w-[260px]'>
        {/* New visitor lands */}
        <div
          className='w-full px-3 py-2 text-center'
          style={{
            backgroundColor: 'var(--linear-bg-surface-2)',
            borderRadius: '6px',
            fontSize: '11px',
            fontWeight: 500,
            color: 'var(--linear-text-secondary)',
            border: '1px solid var(--linear-border-subtle)',
          }}
        >
          New visitor lands
        </div>

        {/* Down arrow */}
        <div
          className='w-px h-5'
          style={{ backgroundColor: 'var(--linear-border-default)' }}
        />

        {/* Branch: 2-column grid */}
        <div className='grid grid-cols-2 gap-2.5 w-full'>
          {/* Left: Didn't subscribe */}
          <div className='flex flex-col items-center gap-1.5'>
            <span
              style={{
                fontSize: '9px',
                fontWeight: 500,
                color: 'var(--linear-text-tertiary)',
                textTransform: 'uppercase' as const,
                letterSpacing: '0.05em',
              }}
            >
              Didn&apos;t subscribe
            </span>
            <div
              className='w-full px-2 py-1.5 text-center'
              style={{
                backgroundColor: 'rgba(59, 130, 246, 0.10)',
                borderRadius: '6px',
                fontSize: '10px',
                fontWeight: 500,
                color: '#3b82f6',
                border: '1px solid rgba(59, 130, 246, 0.15)',
              }}
            >
              FB retargeting
            </div>
            <span
              style={{
                fontSize: '10px',
                color: '#3b82f6',
              }}
            >
              ↑ loop
            </span>
          </div>

          {/* Right: Subscribed */}
          <div className='flex flex-col items-center gap-1.5'>
            <span
              style={{
                fontSize: '9px',
                fontWeight: 500,
                color: 'var(--linear-text-tertiary)',
                textTransform: 'uppercase' as const,
                letterSpacing: '0.05em',
              }}
            >
              Subscribed
            </span>
            <div
              className='w-full px-2 py-1.5 text-center'
              style={{
                backgroundColor: 'rgba(74, 222, 128, 0.10)',
                borderRadius: '6px',
                fontSize: '10px',
                fontWeight: 500,
                color: '#4ade80',
                border: '1px solid rgba(74, 222, 128, 0.15)',
              }}
            >
              Excluded from ads
            </div>
            {/* Down arrow */}
            <div
              className='w-px h-3'
              style={{ backgroundColor: 'var(--linear-border-default)' }}
            />
          </div>
        </div>

        {/* Auto email on release */}
        <div
          className='w-1/2 px-2 py-1.5 text-center mt-1'
          style={{
            backgroundColor: 'rgba(139, 92, 246, 0.10)',
            borderRadius: '6px',
            fontSize: '10px',
            fontWeight: 500,
            color: '#8b5cf6',
            marginLeft: 'auto',
            border: '1px solid rgba(139, 92, 246, 0.15)',
          }}
        >
          Auto email on release
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                    */
/* ------------------------------------------------------------------ */
const mockups = [SearchMockup, BioCardMockup, FlowMockup] as const;

export function HowItWorksRich() {
  return (
    <section
      className='section-spacing-linear'
      style={{
        backgroundColor: 'var(--linear-bg-page)',
        borderTop: '1px solid var(--linear-border-subtle)',
      }}
    >
      <Container size='homepage'>
        {/* Section header */}
        <div className='text-center heading-gap-linear'>
          <p
            style={{
              fontSize: '11px',
              fontWeight: 500,
              color: 'var(--linear-text-tertiary)',
              textTransform: 'uppercase' as const,
              letterSpacing: '0.1em',
            }}
          >
            How it works
          </p>
          <h2
            style={{
              fontSize: 'var(--linear-h2-size-sm)',
              fontWeight: 'var(--linear-font-weight-medium)',
              color: 'var(--linear-text-primary)',
              letterSpacing: 'var(--linear-tracking-headline)',
              lineHeight: 1.15,
              marginTop: '12px',
            }}
          >
            Three steps. Zero complexity.
          </h2>
        </div>

        {/* 3-column grid with gap-border technique */}
        <div
          className='grid grid-cols-1 md:grid-cols-3'
          style={{
            borderRadius: '12px',
            overflow: 'hidden',
            backgroundColor: 'var(--linear-border-subtle)',
            gap: '1px',
          }}
        >
          {steps.map((step, i) => {
            const Mockup = mockups[i];
            return (
              <div
                key={step.number}
                className='group/card flex flex-col relative'
                style={{ backgroundColor: 'var(--linear-bg-surface-0)' }}
              >
                {/* Subtle accent glow on hover */}
                <div
                  className='absolute inset-0 opacity-0 group-hover/card:opacity-100 pointer-events-none'
                  style={{
                    background: `radial-gradient(ellipse 80% 60% at 50% 30%, ${step.accentGlow}, transparent 70%)`,
                    transition:
                      'opacity var(--linear-duration-slow) var(--linear-ease)',
                  }}
                  aria-hidden='true'
                />

                {/* Visual area — generous height for mockup breathing room */}
                <div
                  className='relative'
                  style={{
                    minHeight: '260px',
                  }}
                >
                  <Mockup />
                </div>

                {/* Divider */}
                <div
                  style={{
                    height: '1px',
                    backgroundColor: 'var(--linear-border-subtle)',
                  }}
                />

                {/* Body area */}
                <div
                  className='flex flex-col relative'
                  style={{ padding: '24px 24px 28px' }}
                >
                  {/* Step number badge */}
                  <div className='flex items-center gap-3'>
                    <span
                      className='inline-flex items-center justify-center'
                      style={{
                        fontFamily: 'var(--font-mono, monospace)',
                        fontSize: '11px',
                        fontWeight: 500,
                        color: step.accent,
                        backgroundColor: step.accentDim,
                        borderRadius: '4px',
                        padding: '2px 8px',
                        letterSpacing: '0.02em',
                      }}
                    >
                      {step.number}
                    </span>
                    <div
                      className='flex-1 h-px'
                      style={{
                        backgroundColor: 'var(--linear-border-subtle)',
                      }}
                    />
                  </div>
                  <h3
                    style={{
                      fontSize: '18px',
                      fontWeight: 'var(--linear-font-weight-semibold)',
                      color: 'var(--linear-text-primary)',
                      marginTop: '12px',
                      marginBottom: '8px',
                      letterSpacing: '-0.015em',
                    }}
                  >
                    {step.title}
                  </h3>
                  <p
                    style={{
                      fontSize: '14px',
                      lineHeight: '22px',
                      color: 'var(--linear-text-secondary)',
                    }}
                  >
                    {step.description}
                  </p>
                  {/* Result pill */}
                  <div style={{ marginTop: '16px' }}>
                    <span
                      className='inline-flex items-center gap-1.5'
                      style={{
                        fontSize: '12px',
                        fontWeight: 500,
                        color: step.accent,
                        backgroundColor: step.accentDim,
                        borderRadius: '6px',
                        padding: '4px 10px',
                        border: `1px solid ${step.accent}20`,
                      }}
                    >
                      <span
                        className='inline-block w-1 h-1 rounded-full'
                        style={{ backgroundColor: step.accent }}
                        aria-hidden='true'
                      />
                      {step.result}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
