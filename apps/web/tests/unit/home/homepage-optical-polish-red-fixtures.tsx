/**
 * Deliberate-red fixture for homepage-optical-polish-v1 item 1.
 * Production must not match it. (Item 2, the scaled CSS notch, is retired:
 * web previews are bezel-free under the 2026-09-29 device policy.)
 */

export const HOMEPAGE_OFFSET_COPY_RED_CSS = `
[data-deliberate-red='homepage-offset-copy']
  .homepage-certified-section[data-media='false'][data-align='end']
  .homepage-certified-section__copy {
  max-width: 34rem;
  margin-left: auto;
}
`;
