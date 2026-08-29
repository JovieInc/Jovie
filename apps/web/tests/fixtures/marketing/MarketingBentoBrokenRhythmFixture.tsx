export const MARKETING_BENTO_BROKEN_RHYTHM_FIXTURE_TEST_ID =
  'marketing-bento-broken-rhythm-fixture';

/** Deliberate-red equal-column grid that loses the named outer feature spans. */
export function MarketingBentoBrokenRhythmFixture() {
  return (
    <div
      data-testid={MARKETING_BENTO_BROKEN_RHYTHM_FIXTURE_TEST_ID}
      data-deliberate-red=''
      data-layout='four-equal-columns'
      className='grid grid-cols-1 gap-3 xl:grid-cols-4'
    >
      {['one', 'two', 'three', 'four'].map(id => (
        <article key={id} className='min-h-64' />
      ))}
    </div>
  );
}
