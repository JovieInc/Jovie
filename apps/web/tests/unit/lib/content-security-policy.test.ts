import { describe, expect, it } from 'vitest';
import { buildContentSecurityPolicy } from '@/lib/security/content-security-policy';

const findDirective = (csp: string, directive: string) =>
  csp.split('; ').find(section => section.startsWith(directive));

describe('buildContentSecurityPolicy', () => {
  it('includes a nonce and excludes unsafe-inline in script-src', () => {
    const nonce = 'test-nonce';
    const csp = buildContentSecurityPolicy({ nonce, isDev: false });
    const scriptSrc = findDirective(csp, 'script-src');

    expect(scriptSrc).toContain(`'nonce-${nonce}'`);
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });

  it('includes unsafe-eval in development', () => {
    const csp = buildContentSecurityPolicy({
      nonce: 'test-nonce',
      isDev: true,
    });
    const scriptSrc = findDirective(csp, 'script-src');

    expect(scriptSrc).toContain("'unsafe-eval'");
  });
});
