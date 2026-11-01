import { describe, expect, it } from 'vitest';
import { CONTENT_SIGNAL } from '@/lib/agent-ready/discovery';
import robots from '../../robots';
import { GET } from './route';

describe('/robots.txt (Content-Signal route)', () => {
  it('serves every group from app/robots.ts with a Content-Signal line', async () => {
    const response = GET();
    expect(response.headers.get('content-type')).toBe('text/plain');
    const body = await response.text();
    const config = robots();
    const rules = Array.isArray(config.rules) ? config.rules : [config.rules];
    const groups = body
      .split('\n\n')
      .filter(group => group.includes('User-Agent'));
    expect(groups).toHaveLength(rules.length);
    for (const group of groups) {
      expect(group).toContain(`Content-Signal: ${CONTENT_SIGNAL}`);
    }
    expect(body).toContain(`Sitemap: ${String(config.sitemap)}`);
    for (const rule of rules) {
      for (const path of [rule.disallow ?? []].flat())
        expect(body).toContain(`Disallow: ${path}`);
    }
  });
});
