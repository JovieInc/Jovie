import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ABOUT_COPY, ABOUT_FAQ_ITEMS } from '@/data/aboutCopy';
import {
  ABOUT_REFRESH_DIFFERENTIATORS,
  ABOUT_REFRESH_OPENER,
  ABOUT_REFRESH_TEAM,
  aboutRefreshOpener,
} from '@/data/aboutFooterRefresh';
import { COMPANY_IDENTITY } from '@/data/companyIdentity';
import { PUBLIC_COMMERCIAL_FOOTER_LINKS } from '@/data/marketingNavigation';

describe('about footer refresh copy', () => {
  it('uses one sentence from the company definition as the opener', () => {
    expect(ABOUT_REFRESH_OPENER).toBe(
      'Jovie is one product for presence, relationships, and growth.'
    );
    expect(aboutRefreshOpener(COMPANY_IDENTITY.definition)).toBe(
      ABOUT_REFRESH_OPENER
    );
    expect(ABOUT_REFRESH_OPENER.endsWith('.')).toBe(true);
    expect(ABOUT_REFRESH_OPENER.slice(0, -1)).not.toContain('.');
  });

  it('reuses existing about features as the short differentiator set', () => {
    expect(ABOUT_REFRESH_DIFFERENTIATORS.map(item => item.title)).toEqual([
      'Living Profile',
      'Relationships',
      'Adaptive',
    ]);
    for (const item of ABOUT_REFRESH_DIFFERENTIATORS) {
      expect(ABOUT_COPY.features).toContainEqual(item);
    }
  });

  it('uses the recorded founder as the only team member', () => {
    const founderAnswer = ABOUT_FAQ_ITEMS.find(
      item => item.question === 'Who founded Jovie?'
    )?.answer;

    expect(ABOUT_REFRESH_TEAM).toHaveLength(1);
    expect(ABOUT_REFRESH_TEAM[0]).toMatchObject({
      name: 'Tim White',
      role: 'Founder',
      signoff: ABOUT_COPY.origin.signoff,
      bio: founderAnswer,
    });
  });

  it('links four to six commercial pages that exist on disk', () => {
    expect(PUBLIC_COMMERCIAL_FOOTER_LINKS.length).toBeGreaterThanOrEqual(4);
    expect(PUBLIC_COMMERCIAL_FOOTER_LINKS.length).toBeLessThanOrEqual(6);
    expect(PUBLIC_COMMERCIAL_FOOTER_LINKS.map(link => link.href)).toEqual([
      '/product',
      '/pricing',
      '/artist-profiles',
      '/smart-links',
      '/card',
    ]);

    for (const link of PUBLIC_COMMERCIAL_FOOTER_LINKS) {
      expect(link.href).not.toMatch(/stats/i);
      expect(
        existsSync(
          resolve(process.cwd(), `app/(marketing)${link.href}/page.tsx`)
        )
      ).toBe(true);
    }
  });
});
