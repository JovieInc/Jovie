import { Container } from '@/components/site/Container';
import { BrowserChrome } from './demo/BrowserChrome';
import { DashboardReleasesDemo } from './demo/DashboardReleasesDemo';

export function DashboardShowcase() {
  return (
    <section
      className='section-spacing-linear'
      style={{ backgroundColor: 'var(--linear-bg-page)' }}
    >
      <Container size='homepage'>
        <div className='relative mx-auto max-w-3xl'>
          {/* Ambient glow */}
          <div
            aria-hidden='true'
            className='pointer-events-none absolute -inset-10 -z-10'
            style={{
              background:
                'radial-gradient(ellipse 80% 60% at 50% 50%, oklch(22% 0.02 260 / 0.3), transparent 80%)',
            }}
          />

          {/* Perspective tilt */}
          <div style={{ perspective: '2000px', perspectiveOrigin: '50% 40%' }}>
            <div
              style={{
                transform: 'rotateX(2deg)',
                transformStyle: 'preserve-3d',
                borderRadius: 'var(--linear-radius-lg)',
                overflow: 'hidden',
                boxShadow: 'var(--linear-shadow-card-elevated)',
              }}
            >
              <BrowserChrome title='jov.ie — Releases'>
                <DashboardReleasesDemo />
              </BrowserChrome>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
