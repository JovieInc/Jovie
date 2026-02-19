import { BadgeCheck, Check, Link2, Search } from 'lucide-react';
import { Container } from '@/components/site/Container';

const steps = [
  {
    number: '01',
    title: 'Paste your Spotify',
    description:
      'Jovie imports your discography, photo, bio, and every release — matched across all major platforms.',
    result: '→ Done in 10 seconds',
    resultColor: '#4ade80',
    accent: '#4ade80',
  },
  {
    number: '02',
    title: 'Share one link',
    description:
      'Put jov.ie/you in your bio. Every release already has its own smart link. Your profile adapts to each visitor.',
    result: '→ Replace your Linktree',
    resultColor: '#8b5cf6',
    accent: '#8b5cf6',
  },
  {
    number: '03',
    title: 'Grow on autopilot',
    description:
      'Non-subscribers get retargeted on Facebook. Subscribers are excluded and notified when you drop new music.',
    result: '→ Fans you actually own',
    resultColor: '#3b82f6',
    accent: '#3b82f6',
  },
] as const;

/* ------------------------------------------------------------------ */
/*  Step 1 mockup — Search bar + result card with import tags          */
/* ------------------------------------------------------------------ */
function SearchMockup() {
  const activePlatforms = ['Spotify', 'Apple Music', 'YouTube', 'Tidal'];
  return (
    <div className='flex flex-col items-center justify-center h-full px-6'>
      {/* Search bar */}
      <div
        className='w-full max-w-[240px] flex items-center gap-2 px-3 py-2'
        style={{
          backgroundColor: 'var(--linear-bg-surface-1)',
          borderRadius: '8px',
          border: '1px solid var(--linear-border-subtle)',
        }}
      >
        <Search
          aria-hidden='true'
          size={14}
          className='text-[var(--linear-text-tertiary)]'
        />
        <span
          style={{
            fontSize: '13px',
            color: 'var(--linear-text-primary)',
            fontWeight: 450,
          }}
        >
          Tim White
        </span>
      </div>

      {/* Result card */}
      <div
        className='w-full max-w-[240px] mt-2 flex items-center gap-3 px-3 py-2.5'
        style={{
          backgroundColor: 'var(--linear-bg-surface-1)',
          borderRadius: '8px',
          border: '1px solid var(--linear-border-subtle)',
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
      <div className='w-full max-w-[240px] mt-2 flex flex-wrap gap-1'>
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
    <div className='flex flex-col items-center justify-center h-full px-6'>
      <div
        className='w-full max-w-[240px] flex flex-col py-4 px-4'
        style={{
          backgroundColor: 'var(--linear-bg-surface-1)',
          borderRadius: '8px',
          border: '1px solid var(--linear-border-subtle)',
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
                }}
              >
                timwhitemusic
              </span>
              {/* Verified badge */}
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
          <div className='flex flex-wrap gap-1 mt-1.5'>
            <span
              className='px-2 py-0.5'
              style={{
                fontSize: '10px',
                fontWeight: 500,
                color: 'var(--linear-text-secondary)',
                backgroundColor: 'var(--linear-bg-surface-2)',
                borderRadius: '4px',
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
    <div className='flex flex-col items-center justify-center h-full px-6'>
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
          }}
        >
          New visitor lands
        </div>

        {/* Down arrow */}
        <div
          className='w-px h-4'
          style={{ backgroundColor: 'var(--linear-border-default)' }}
        />

        {/* Branch: 2-column grid */}
        <div className='grid grid-cols-2 gap-2 w-full'>
          {/* Left: Didn't subscribe */}
          <div className='flex flex-col items-center gap-1'>
            <span
              style={{
                fontSize: '9px',
                fontWeight: 500,
                color: 'var(--linear-text-tertiary)',
                textTransform: 'uppercase' as const,
                letterSpacing: '0.04em',
              }}
            >
              Didn&apos;t subscribe
            </span>
            <div
              className='w-full px-2 py-1.5 text-center'
              style={{
                backgroundColor: 'rgba(59, 130, 246, 0.12)',
                borderRadius: '5px',
                fontSize: '10px',
                fontWeight: 500,
                color: '#3b82f6',
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
          <div className='flex flex-col items-center gap-1'>
            <span
              style={{
                fontSize: '9px',
                fontWeight: 500,
                color: 'var(--linear-text-tertiary)',
                textTransform: 'uppercase' as const,
                letterSpacing: '0.04em',
              }}
            >
              Subscribed
            </span>
            <div
              className='w-full px-2 py-1.5 text-center'
              style={{
                backgroundColor: 'rgba(74, 222, 128, 0.12)',
                borderRadius: '5px',
                fontSize: '10px',
                fontWeight: 500,
                color: '#4ade80',
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
            backgroundColor: 'rgba(139, 92, 246, 0.12)',
            borderRadius: '5px',
            fontSize: '10px',
            fontWeight: 500,
            color: '#8b5cf6',
            marginLeft: 'auto',
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
        {/* Section label only — no h2 per prototype */}
        <div className='text-center heading-gap-linear'>
          <p
            style={{
              fontSize: 'var(--linear-caption-size)',
              fontWeight: 'var(--linear-font-weight-medium)',
              color: 'var(--linear-text-secondary)',
              textTransform: 'uppercase' as const,
              letterSpacing: '0.05em',
            }}
          >
            How it works
          </p>
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
                className='flex flex-col'
                style={{ backgroundColor: 'var(--linear-bg-surface-0)' }}
              >
                {/* Visual area */}
                <div className='relative' style={{ minHeight: '220px' }}>
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
                  className='flex flex-col'
                  style={{ padding: 'var(--linear-space-6)' }}
                >
                  {/* Step number with extending line */}
                  <div className='flex items-center gap-3'>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono, monospace)',
                        fontSize: 'var(--linear-caption-size)',
                        fontWeight: 'var(--linear-font-weight-medium)',
                        color: step.accent,
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
                      fontSize: 'var(--linear-h4-size)',
                      fontWeight: 'var(--linear-font-weight-semibold)',
                      color: 'var(--linear-text-primary)',
                      marginTop: 'var(--linear-space-2)',
                      marginBottom: 'var(--linear-space-2)',
                    }}
                  >
                    {step.title}
                  </h3>
                  <p
                    style={{
                      fontSize: 'var(--linear-body-sm-size)',
                      lineHeight: 'var(--linear-body-sm-leading)',
                      color: 'var(--linear-text-secondary)',
                    }}
                  >
                    {step.description}
                  </p>
                  {/* Result arrow */}
                  <p
                    style={{
                      fontSize: 'var(--linear-body-sm-size)',
                      fontWeight: 'var(--linear-font-weight-medium)',
                      color: step.resultColor,
                      marginTop: 'var(--linear-space-3)',
                    }}
                  >
                    {step.result}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
