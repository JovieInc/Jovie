import { describe, expect, it } from 'vitest';
import { MARKETING_EXACT_PUBLIC_ROUTE_TARGETS } from '@/data/marketing/routeManifest';
import {
  SITEMAP_PUBLISHED_LEGAL_PATHS,
  SITEMAP_PUBLISHED_MACHINE_PATHS,
} from '@/lib/seo/sitemap-publication';
import {
  buildCompanyPresencePages,
  COMPANY_PRESENCE_SOURCES,
  labelForCompanyPath,
} from './inventory';
import { COMPANY_PRESENCE_CHECK_IDS } from './model';

describe('buildCompanyPresencePages', () => {
  const pages = buildCompanyPresencePages({
    ownedProfiles: [
      { username: 'tim', displayName: 'Tim White' },
      { username: 'jovie', displayName: null },
    ],
  });
  const paths = pages.map(page => page.path);

  it('lists every active exact marketing route once', () => {
    for (const target of MARKETING_EXACT_PUBLIC_ROUTE_TARGETS) {
      expect(paths).toContain(target.url);
    }
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('includes published legal and machine paths', () => {
    for (const path of SITEMAP_PUBLISHED_LEGAL_PATHS) {
      expect(pages.find(page => page.path === path)?.kind).toBe('legal');
    }
    for (const path of SITEMAP_PUBLISHED_MACHINE_PATHS) {
      expect(pages.find(page => page.path === path)?.kind).toBe('machine');
    }
  });

  it('includes owned profiles with a display-name or handle label', () => {
    expect(pages.find(page => page.path === '/tim')).toMatchObject({
      kind: 'profile',
      label: 'Tim White',
    });
    expect(pages.find(page => page.path === '/jovie')?.label).toBe('@jovie');
  });

  it('classifies editorial indexes separately from marketing', () => {
    const blog = pages.find(page => page.path === '/blog');
    if (blog) expect(blog.kind).toBe('editorial');
    expect(pages.find(page => page.path === '/')?.kind).toBe('marketing');
  });

  it('marks every check unconfigured with the source reason while no source is wired', () => {
    for (const page of pages) {
      for (const id of COMPANY_PRESENCE_CHECK_IDS) {
        const check = page.checks[id];
        expect(check.state).toBe('unconfigured');
        const source = COMPANY_PRESENCE_SOURCES.find(item => item.id === id);
        if (check.state === 'unconfigured') {
          expect(check.reason).toBe(source?.reason);
        }
      }
    }
  });

  it('uses a generic reason when a source has no reason', () => {
    const [first] = buildCompanyPresencePages({
      ownedProfiles: [],
      sources: [],
    });
    expect(first?.checks.indexed).toEqual({
      state: 'unconfigured',
      reason: 'No source is connected for this check.',
    });
  });
});

describe('COMPANY_PRESENCE_SOURCES', () => {
  it('declares one unconfigured source with a reason per check', () => {
    expect(COMPANY_PRESENCE_SOURCES.map(source => source.id)).toEqual([
      ...COMPANY_PRESENCE_CHECK_IDS,
    ]);
    for (const source of COMPANY_PRESENCE_SOURCES) {
      expect(source.configured).toBe(false);
      expect(source.reason).toBeTruthy();
    }
  });
});

describe('labelForCompanyPath', () => {
  it('derives Title Case labels from paths', () => {
    expect(labelForCompanyPath('/')).toBe('Home');
    expect(labelForCompanyPath('/smart-links')).toBe('Smart Links');
    expect(labelForCompanyPath('/legal/privacy')).toBe('Privacy');
    expect(labelForCompanyPath('/llms.txt')).toBe('llms.txt');
  });
});
