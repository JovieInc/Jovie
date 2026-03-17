import { Container } from '@/components/site/Container';

export function CaptureFlowSection() {
  return (
    <section className='section-spacing-linear bg-base border-t border-subtle'>
      <Container size='homepage'>
        <div className='max-w-3xl mx-auto'>
          <h2 className='marketing-h2-linear text-center mb-4'>
            New fans subscribe. Returning fans listen.
          </h2>
          <p className='marketing-lead-linear text-secondary-token text-center mb-12'>
            Every visitor gets the right action—not a wall of links.
          </p>

          <div className='grid grid-cols-1 md:grid-cols-2 gap-8'>
            {/* First visit */}
            <div className='p-6 rounded-xl border border-subtle bg-surface-1'>
              <p className='text-xs font-medium text-tertiary-token uppercase tracking-wide mb-3'>
                First visit
              </p>
              <h3 className='text-lg font-medium text-primary-token mb-2'>
                Capture their email or SMS
              </h3>
              <p className='text-sm text-secondary-token'>
                Before they see your links, they subscribe. No more anonymous
                traffic bouncing away forever.
              </p>
            </div>

            {/* Return visit */}
            <div className='p-6 rounded-xl border border-subtle bg-surface-1'>
              <p className='text-xs font-medium text-tertiary-token uppercase tracking-wide mb-3'>
                Return visit
              </p>
              <h3 className='text-lg font-medium text-primary-token mb-2'>
                Send them straight to your music
              </h3>
              <p className='text-sm text-secondary-token'>
                Already subscribed? Skip the form. One tap to Spotify, Apple
                Music, or your latest release.
              </p>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
