const LEAD_TEXT = 'Jovie helps artists release music faster';
const SUPPORT_TEXT =
  'so they learn what works and iterate before they burn out.';
const FULL_TEXT = `${LEAD_TEXT} ${SUPPORT_TEXT}`;

function getRevealWords(text: string) {
  let cursor = 0;

  return text.split(' ').map(word => {
    const start = text.indexOf(word, cursor);
    cursor = start + word.length + 1;

    return {
      key: `${word}-${start}`,
      word,
    };
  });
}

function RevealWords({
  className,
  testId,
  wrapperClassName,
  text,
}: Readonly<{
  className: string;
  testId?: string;
  wrapperClassName?: string;
  text: string;
}>) {
  return (
    <span className={wrapperClassName} data-testid={testId}>
      {getRevealWords(text).map(({ key, word }) => (
        <span key={key} className={className}>
          {word}
        </span>
      ))}
    </span>
  );
}

export function HomepageReleaseVelocityReveal() {
  return (
    <section
      aria-labelledby='homepage-release-velocity-heading'
      className='relative isolate overflow-hidden bg-[#020303] px-[var(--homepage-page-gutter)] py-20 text-center sm:py-24 lg:py-28'
      data-testid='homepage-release-velocity-reveal'
    >
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent'
      />
      <div
        aria-hidden='true'
        className='pointer-events-none absolute left-1/2 top-1/2 h-72 w-[72vw] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(94,106,210,0.12),transparent_64%)] blur-3xl'
      />
      <h2
        id='homepage-release-velocity-heading'
        aria-label={FULL_TEXT}
        className='relative mx-auto max-w-[13.5ch] text-balance text-[3rem] font-semibold leading-[0.92] tracking-normal sm:text-[5.5rem] lg:text-[6.75rem] xl:text-[7.2rem]'
      >
        <span aria-hidden='true'>
          <RevealWords
            className='mr-[0.18em] inline-block text-white'
            testId='homepage-release-velocity-lead'
            text={LEAD_TEXT}
            wrapperClassName='text-white'
          />
          <RevealWords
            className='mr-[0.18em] inline-block text-white/36'
            testId='homepage-release-velocity-support'
            text={SUPPORT_TEXT}
            wrapperClassName='text-white/36'
          />
        </span>
      </h2>
    </section>
  );
}
