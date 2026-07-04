import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('/ga-consent-init.js', () => {
  it('serves the GA consent bootstrap as same-origin JavaScript', async () => {
    const response = GET();
    const body = await response.text();

    expect(response.headers.get('Content-Type')).toBe(
      'text/javascript; charset=utf-8'
    );
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=300');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(body).toContain("gtag('consent', 'default'");
    expect(body).toContain('jv_cc_required=1');
  });
});
