import { describe, expect, it } from 'vitest';
import { gateContentRecord, validateContentRecord } from './kind';
import { getContentKind } from './registry';
import {
  CHROME_BLOCKED_PATHS,
  DEFAULT_SITE_CHROME,
  FOOTER_LINK_BUDGET,
  SITE_CHROME_KIND,
  type SiteChrome,
} from './site-chrome';

const clone = (): SiteChrome => structuredClone(DEFAULT_SITE_CHROME);
const gate = (data: unknown) =>
  gateContentRecord(getContentKind('site-chrome')!, 'main', data);
const errorsOf = (data: unknown) => {
  const result = gate(data);
  return result.ok ? [] : result.errors;
};

describe('site-chrome content kind', () => {
  it('accepts the code default through every publish gate', () => {
    expect(gate(clone())).toEqual({ ok: true, data: clone() });
  });

  it('keeps the footer short: 3 columns, within the link budget', () => {
    const { columns } = DEFAULT_SITE_CHROME.footer;
    const total = columns.reduce((n, c) => n + c.links.length, 0);
    expect(columns).toHaveLength(3);
    expect(total).toBeGreaterThanOrEqual(FOOTER_LINK_BUDGET.min);
    expect(total).toBeLessThanOrEqual(FOOTER_LINK_BUDGET.max);
  });

  it('rejects an unknown key', () => {
    expect(validateContentRecord(SITE_CHROME_KIND, 'other', clone())).toEqual({
      ok: false,
      errors: ['Unknown site-chrome key: other'],
    });
  });

  it('rejects title-case labels and names the field path', () => {
    const chrome = clone();
    chrome.footer.columns[0]!.links[0]!.label = 'Artist Profiles';
    expect(errorsOf(chrome)).toEqual([
      expect.stringContaining('footer.product.artist-profiles.label'),
    ]);
  });

  it('allows proper nouns inside sentence case', () => {
    const chrome = clone();
    chrome.footer.columns[0]!.links[0]!.label = 'Jovie profiles';
    expect(errorsOf(chrome)).toEqual([]);
  });

  it('rejects dead-end and internal destinations', () => {
    for (const [path, reason] of Object.entries(CHROME_BLOCKED_PATHS)) {
      const chrome = clone();
      chrome.footer.columns[1]!.links[0]!.href = path;
      expect(errorsOf(chrome).join(' ')).toContain(reason);
    }
  });

  it('requires Privacy and Terms links in the legal row', () => {
    const chrome = clone();
    chrome.footer.legal = [
      { id: 'privacy', label: 'Privacy', href: '/legal/privacy' },
      { id: 'cookies', label: 'Cookies', href: '/legal/cookies' },
    ];
    expect(errorsOf(chrome).join(' ')).toContain('must link /legal/terms');
  });

  it('rejects duplicate footer destinations', () => {
    const chrome = clone();
    chrome.footer.columns[2]!.links[0]!.href = '/pricing';
    expect(errorsOf(chrome).join(' ')).toContain('appears twice');
  });

  it('rejects unapproved external hosts and non-https links', () => {
    const chrome = clone();
    chrome.footer.columns[1]!.links[3]!.href = 'https://example.com/jovie';
    expect(errorsOf(chrome).join(' ')).toContain('not an approved social');
    chrome.footer.columns[1]!.links[3]!.href = 'http://instagram.com/meetjovie';
    expect(errorsOf(chrome).join(' ')).toContain('https');
  });

  it('rejects labels that would wrap in a narrow column', () => {
    const chrome = clone();
    chrome.footer.columns[0]!.links[0]!.label = 'A'.repeat(25);
    expect(errorsOf(chrome).length).toBeGreaterThan(0);
  });

  it('rejects a footer outside the link budget', () => {
    const chrome = clone();
    chrome.footer.columns[0]!.links = chrome.footer.columns[0]!.links.slice(
      0,
      2
    );
    chrome.footer.columns[1]!.links = chrome.footer.columns[1]!.links.slice(
      0,
      2
    );
    chrome.footer.columns[2]!.links = chrome.footer.columns[2]!.links.slice(
      0,
      2
    );
    expect(errorsOf(chrome).join(' ')).toContain('keep it between');
  });

  it('render smoke test passes the default and exposes every link', () => {
    const kind = getContentKind('site-chrome')!;
    expect(kind.smoke?.(clone(), 'main')).toEqual([]);
  });

  it('render smoke test reports a missing legal link', () => {
    const kind = getContentKind('site-chrome')!;
    const chrome = clone();
    chrome.footer.legal = chrome.footer.legal.filter(
      link => link.href !== '/legal/terms'
    );
    expect(kind.smoke?.(chrome, 'main')).toContain(
      'footer.legal: /legal/terms missing'
    );
  });
});
