import { describe, expect, it } from 'vitest';
import { scrubDisplayBreadcrumb, scrubDisplayString } from './scrub';

const PROOF = `air-office.1800000000.${'ab'.repeat(32)}`;

describe('display breadcrumb scrubbing', () => {
  it('removes the fragment from navigation breadcrumbs', () => {
    const scrubbed = scrubDisplayBreadcrumb({
      category: 'navigation',
      data: {
        from: '/',
        to: `https://ovie.jov.ie/display/connect#${PROOF}`,
      },
    });
    expect(JSON.stringify(scrubbed)).not.toContain(PROOF);
    expect(JSON.stringify(scrubbed)).not.toContain('ab'.repeat(32));
    expect(scrubbed.data?.to).toBe(
      'https://ovie.jov.ie/display/connect#[scrubbed]'
    );
  });
  it('removes a bare proof anywhere (message, nested data, arrays)', () => {
    const scrubbed = scrubDisplayBreadcrumb({
      message: `connecting with ${PROOF}`,
      data: { nested: { args: [PROOF, 'ok'] } },
    });
    expect(JSON.stringify(scrubbed)).not.toContain('ab'.repeat(32));
    expect(JSON.stringify(scrubbed)).toContain('ok');
  });
  it('leaves unrelated breadcrumbs alone', () => {
    const crumb = { message: 'clicked', data: { url: '/app/ov', n: 3 } };
    expect(scrubDisplayBreadcrumb(crumb)).toEqual(crumb);
    expect(scrubDisplayString('/display')).toBe('/display');
  });
});
