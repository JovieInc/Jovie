import { Container } from '@/components/site/Container';

const VALUE_PROPS = [
  {
    title: 'Skip the setup',
    body: 'Connect Spotify once. Your catalog, artwork, and release-ready smart links stay in sync without rebuilding the launch every time.',
  },
  {
    title: 'Release smarter',
    body: 'Keep the launch surface free, then turn on paid release notifications and automation when you want more than a basic smart link.',
  },
  {
    title: 'Retarget every touchpoint',
    body: 'Your smart links, profile, and fan capture flows stay instrumented so every release builds a warmer audience before you open an ads manager.',
  },
] as const;

export function ValuePropsSection() {
  return (
    <section className='section-spacing-linear relative overflow-hidden bg-page'>
      <Container size='homepage'>
        <div className='homepage-section-shell'>
          <div className='homepage-section-intro reveal-on-scroll'>
            <div className='flex max-w-[22rem] flex-col gap-4 lg:max-w-none'>
              <span className='homepage-section-eyebrow'>One platform</span>
              <h2 className='marketing-h2-linear max-w-[10ch] text-primary-token md:max-w-[12ch] lg:max-w-none'>
                One Tool. Zero Setup.
              </h2>
            </div>
            <p className='homepage-section-copy marketing-lead-linear text-secondary-token'>
              Jovie replaces the release work artists usually skip when they are
              trying to move fast.
            </p>
          </div>

          <div
            className='homepage-section-stack reveal-on-scroll grid gap-3.5 md:grid-cols-3'
            data-delay='80'
          >
            {VALUE_PROPS.map(prop => (
              <article
                key={prop.title}
                className='homepage-surface-card rounded-[1rem] p-5 md:p-[1.35rem]'
              >
                <p className='text-lg font-medium tracking-tight text-primary-token'>
                  {prop.title}
                </p>
                <p className='mt-3 text-sm leading-6 text-secondary-token'>
                  {prop.body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
