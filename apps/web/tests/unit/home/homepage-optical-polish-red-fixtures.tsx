/**
 * Deliberate-red fixtures for homepage-optical-polish-v1 items 1–2.
 * Production must not match these. Tests prove an offset column or an
 * unscaled notch would fail the optical contract.
 */

export const HOMEPAGE_OFFSET_COPY_RED_CSS = `
[data-deliberate-red='homepage-offset-copy']
  .homepage-certified-section[data-media='false'][data-align='end']
  .homepage-certified-section__copy {
  max-width: 34rem;
  margin-left: auto;
}
`;

export function HomepageUnscaledNotchRedFixture() {
  return (
    <div
      className='ap-phone-frame'
      data-deliberate-red='homepage-unscaled-notch'
      data-size='sm'
      style={{ width: '7.5rem' }}
    >
      <div
        aria-hidden='true'
        className='ap-phone-frame__notch absolute left-1/2 top-3 z-20 h-6 w-28 -translate-x-1/2 rounded-full'
      />
    </div>
  );
}
