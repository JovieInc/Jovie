import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CLI_HEADLINE } from '@/components/marketing/CliLandingPage';
import { COMPANY_IDENTITY } from '@/data/companyIdentity';
import {
  MARKETING_OG_CARDS,
  MARKETING_OG_SIZE,
  marketingOgCard,
} from '@/data/marketingOgCopy';
import { BRAND_ION_BLUE } from '@/lib/brand/tokens';
import {
  marketingOgSvg,
  renderMarketingOgPng,
} from '@/lib/og/marketing-og-card';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const RETIRED_TAGLINE = 'Control how the world sees you.';

describe('marketing OG cards', () => {
  it('uses the locked headline on the default card and no retired tagline', () => {
    expect(marketingOgCard('default').title).toBe(
      COMPANY_IDENTITY.homepageHeadline
    );
    expect(COMPANY_IDENTITY.homepageHeadline).toBe('Be found. Be understood.');
    const svg = marketingOgSvg(marketingOgCard('default'));
    expect(svg).toContain('Be found. Be understood.');
    expect(svg).toContain(BRAND_ION_BLUE);
    expect(svg).toContain('#08090a');
    expect(svg).not.toContain(RETIRED_TAGLINE);
    expect(svg.toLowerCase()).not.toContain('#ff7800');
    expect(svg.toLowerCase()).not.toContain('headphone');
    expect(svg.toLowerCase()).not.toContain('music');
    for (const card of MARKETING_OG_CARDS) {
      expect(marketingOgSvg(card)).not.toContain(RETIRED_TAGLINE);
    }
  });

  it('keeps the alternatives index card free of the musician headline', () => {
    expect(marketingOgCard('alternatives').title).toBe('Alternatives');
    expect(marketingOgCard('cli').title).toBe(CLI_HEADLINE);
  });

  it('commits a unique 1200x630 PNG for every card', () => {
    const files = new Set<string>();
    for (const card of MARKETING_OG_CARDS) {
      expect(files.has(card.file)).toBe(false);
      files.add(card.file);
      const buf = readFileSync(join(process.cwd(), 'public/og', card.file));
      expect(buf.byteLength).toBeGreaterThan(8_000);
      expect(buf.subarray(0, 8).equals(PNG_MAGIC)).toBe(true);
      expect(buf.readUInt32BE(16)).toBe(MARKETING_OG_SIZE.width);
      expect(buf.readUInt32BE(20)).toBe(MARKETING_OG_SIZE.height);
    }
    expect(files.size).toBe(13);
  });

  it('renders the default card to a PNG', async () => {
    const png = await renderMarketingOgPng(marketingOgCard('default'));
    expect(png.subarray(0, 8).equals(PNG_MAGIC)).toBe(true);
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  });
});
