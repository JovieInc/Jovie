import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MARKETING_OG_CARDS,
  MARKETING_OG_SIZE,
  type MarketingOgCard,
} from '@/data/marketingOgCards';
import { BRAND_ION_BLUE } from '@/lib/brand/tokens';

const fontDir = join(process.cwd(), 'public/fonts');
const fontConfigPath = join('/tmp', 'jovie-marketing-og-fonts.conf');
writeFileSync(
  fontConfigPath,
  `<?xml version="1.0"?>
<fontconfig>
  <dir>${fontDir}</dir>
  <cachedir>/tmp/jovie-marketing-og-fontconfig</cachedir>
</fontconfig>
`
);
process.env.FONTCONFIG_FILE ??= fontConfigPath;

const SURFACE = '#08090a';
const CREAM = '#F5F4F0';
const KICKER = 'jov.ie';

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function wrapOgTitle(title: string, maxChars = 28): string[] {
  const words = title.trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current.length === 0 ? word : `${current} ${word}`;
    if (next.length > maxChars && current.length > 0) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

export function marketingOgSvg(card: MarketingOgCard): string {
  const lines = wrapOgTitle(card.title, card.title.length > 42 ? 24 : 28);
  const fontSize = lines.length >= 3 ? 52 : 64;
  const lineHeight = Math.round(fontSize * 1.15);
  const blockHeight = lines.length * lineHeight;
  const titleTop =
    Math.round((MARKETING_OG_SIZE.height - blockHeight) / 2) + fontSize;
  const title = lines
    .map((line, index) => {
      const y = titleTop + index * lineHeight;
      return `<text x="88" y="${y}" fill="${CREAM}" font-family="Satoshi Variable" font-size="${fontSize}" font-weight="700">${escapeXml(line)}</text>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${MARKETING_OG_SIZE.width}" height="${MARKETING_OG_SIZE.height}" viewBox="0 0 ${MARKETING_OG_SIZE.width} ${MARKETING_OG_SIZE.height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${MARKETING_OG_SIZE.width}" height="${MARKETING_OG_SIZE.height}" fill="${SURFACE}"/>
  <rect x="0" y="0" width="8" height="${MARKETING_OG_SIZE.height}" fill="${BRAND_ION_BLUE}"/>
  <text x="88" y="132" fill="${BRAND_ION_BLUE}" font-family="Satoshi Variable" font-size="28" font-weight="700">${KICKER}</text>
  ${title}
  <rect x="88" y="520" width="72" height="8" fill="${BRAND_ION_BLUE}"/>
</svg>`;
}

export async function renderMarketingOgPng(
  card: MarketingOgCard
): Promise<Buffer> {
  const { default: sharp } = await import('sharp');
  return sharp(Buffer.from(marketingOgSvg(card)))
    .png()
    .toBuffer();
}

export async function writeMarketingOgCards(outputDir: string): Promise<void> {
  mkdirSync(outputDir, { recursive: true });
  for (const card of MARKETING_OG_CARDS) {
    const png = await renderMarketingOgPng(card);
    writeFileSync(join(outputDir, card.file), png);
  }
}
