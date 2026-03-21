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
        <div className='relative mx-auto max-w-[var(--linear-content-max)]'>
          <div className='reveal-on-scroll grid items-end section-gap-linear md:grid-cols-[0.92fr_1.08fr]'>
            <div className='flex max-w-[22rem] flex-col gap-5'>
              <span className='inline-flex w-fit items-center gap-1.5 rounded-full border border-subtle px-3 py-1 text-[12px] font-medium tracking-[-0.01em] text-tertiary-token'>
                One platform
              </span>
              <h2 className='marketing-h2-linear max-w-[10ch] text-primary-token'>
                One Tool. Zero Setup.
              </h2>
            </div>
            <p className='max-w-xl marketing-lead-linear text-secondary-token md:justify-self-end'>
              Jovie replaces the release work artists usually skip when they are
              trying to move fast.
            </p>
          </div>

          <div
            className='reveal-on-scroll mt-8 grid gap-4 md:mt-8 md:grid-cols-3'
            data-delay='80'
          >
            {VALUE_PROPS.map(prop => (
              <article
                key={prop.title}
                className='rounded-[0.95rem] border border-subtle bg-surface-0 p-6'
              >
                <p className='text-lg font-medium tracking-tight text-primary-token'>
                  {prop.title}
                </p>
                <p className='mt-4 text-sm leading-6 text-secondary-token'>
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
