import { Container } from '@/components/site/Container';

interface JovieLink {
  emoji: string;
  label: string;
  url: string;
}

const jovieLinks: JovieLink[] = [
  { emoji: '\uD83C\uDFB5', label: 'New Music', url: 'jov.ie/tim/listen' },
  { emoji: '\uD83C\uDFA4', label: 'Tour', url: 'jov.ie/tim/tour' },
  { emoji: '\uD83D\uDCB0', label: 'Tip', url: 'jov.ie/tim/tip' },
  { emoji: '\uD83D\uDCE7', label: 'Booking', url: 'jov.ie/tim/contact' },
  { emoji: '\uD83D\uDECD\uFE0F', label: 'Merch', url: 'jov.ie/tim/merch' },
];

export function IGComparisonAside() {
  return (
    <section className='section-spacing-linear bg-[var(--linear-bg-page)] border-t border-[var(--linear-border-subtle)]'>
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
            Stop sending fans through a maze.
          </h2>
          <p
            style={{
              fontSize: 'var(--linear-body-lg-size)',
              color: 'var(--linear-text-secondary)',
              marginTop: '12px',
            }}
          >
            Replace one generic link with deeplinks that go exactly where fans
            need.
          </p>
        </div>

        <div className='grid grid-cols-1 md:grid-cols-2 overflow-hidden bg-[var(--linear-border-subtle)] gap-px rounded-[10px]'>
          {/* Linktree side (dimmed) */}
          <div className='flex flex-col gap-4 p-6 bg-[var(--linear-bg-surface-0)] opacity-50'>
            <span className='text-xs font-medium uppercase tracking-wider text-[var(--linear-text-tertiary)]'>
              Linktree in your bio
            </span>

            <div className='rounded-md px-3 py-2 font-mono text-sm bg-[var(--linear-bg-surface-1)] text-[var(--linear-text-tertiary)]'>
              linktr.ee/timwhite
            </div>

            <p className='text-[length:var(--linear-body-sm-size)] leading-[var(--linear-body-sm-leading)] text-[var(--linear-text-tertiary)]'>
              Fan taps → Linktree page → scrolls to find link → taps again
            </p>

            <p className='font-medium text-[length:var(--linear-body-sm-size)] text-[var(--linear-text-secondary)]'>
              2 extra clicks
            </p>
          </div>

          {/* Jovie side (bright) */}
          <div className='flex flex-col gap-4 p-6 bg-[var(--linear-bg-surface-0)]'>
            <span
              className='inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-medium'
              style={{
                backgroundColor: 'rgba(74, 222, 128, 0.12)',
                color: '#4ade80',
              }}
            >
              Jovie deeplinks in your bio
            </span>

            <div className='flex flex-col gap-1.5'>
              {jovieLinks.map(link => (
                <div
                  key={link.url}
                  className='flex items-center gap-2.5 rounded-md px-3 py-2 text-sm bg-[var(--linear-bg-surface-1)]'
                >
                  <span>{link.emoji}</span>
                  <span className='text-[var(--linear-text-secondary)] text-[length:var(--linear-body-sm-size)]'>
                    {link.label}
                  </span>
                  <span className='ml-auto font-mono text-xs text-[var(--linear-text-tertiary)]'>
                    {link.url}
                  </span>
                </div>
              ))}
            </div>

            <p className='text-[length:var(--linear-body-sm-size)] leading-[var(--linear-body-sm-leading)] text-[var(--linear-text-tertiary)]'>
              Fan taps → arrives exactly where they need to be
            </p>

            <p className='font-medium text-green-400 text-[length:var(--linear-body-sm-size)]'>
              Zero friction
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}
