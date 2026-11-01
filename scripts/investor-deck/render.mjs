// Render ledger deck slides to one HTML document of 16:9 pages on the Jovie
// design system: every colour is a CSS variable generated from the canonical
// design.tokens.json (semantic names only), type is the DS pair (Satoshi
// display, Inter body). The template holds no raw colour literal; the test
// suite enforces that.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../../', import.meta.url);
export const TOKENS_PATH = fileURLToPath(new URL('design.tokens.json', ROOT));
const FONTS = {
  inter: fileURLToPath(
    new URL('apps/web/public/fonts/Inter-Latin.woff2', ROOT)
  ),
  satoshi: fileURLToPath(
    new URL('apps/web/public/fonts/Satoshi-Latin.woff2', ROOT)
  ),
};

/** The semantic tokens the deck uses, as `--ds-<group>-<name>` variables. */
export const DECK_TOKENS = Object.freeze([
  ['surface', 'canvas'],
  ['surface', 'panel'],
  ['surface', 'elevated'],
  ['text', 'primary'],
  ['text', 'secondary'],
  ['text', 'tertiary'],
  ['border', 'subtle'],
  ['border', 'default'],
  ['accent', 'ion'],
]);

export function tokenCss(
  tokens = JSON.parse(readFileSync(TOKENS_PATH, 'utf8'))
) {
  const lines = DECK_TOKENS.map(([group, name]) => {
    const token = tokens.color?.[`${group}.${name}`];
    const value = token?.$value ?? token?.value;
    if (!value)
      throw new Error(`design.tokens.json has no color.${group}.${name}`);
    return `  --ds-${group}-${name}: ${value};`;
  });
  return `:root {\n${lines.join('\n')}\n}`;
}

function fontFace(family, path, weight) {
  const data = readFileSync(path).toString('base64');
  return `@font-face{font-family:'${family}';src:url(data:font/woff2;base64,${data}) format('woff2');font-weight:${weight};font-display:block}`;
}

const esc = value =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

export const DECK_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:var(--ds-surface-canvas);color:var(--ds-text-primary)}
body{font-family:'Inter',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.slide{width:1920px;height:1080px;padding:96px 128px 72px;display:flex;flex-direction:column;
  background:var(--ds-surface-canvas);border-bottom:1px solid var(--ds-border-subtle);
  page-break-after:always;break-after:page;overflow:hidden;position:relative}
.kicker{font-size:22px;letter-spacing:.08em;text-transform:uppercase;color:var(--ds-text-tertiary);margin-bottom:28px}
h1{font-family:'Satoshi','Inter',sans-serif;font-weight:700;font-size:76px;line-height:1.06;
  letter-spacing:-.02em;max-width:1500px;text-wrap:balance}
.cover h1{font-size:104px;max-width:1400px}
.body{margin-top:44px;display:flex;flex-direction:column;gap:18px;flex:1;min-height:0}
.support{font-size:29px;line-height:1.38;color:var(--ds-text-secondary);max-width:1400px;text-wrap:pretty}
.stats{display:grid;grid-template-columns:repeat(var(--cols),1fr);gap:24px;margin-bottom:12px}
.stat{background:var(--ds-surface-panel);border:1px solid var(--ds-border-subtle);border-radius:20px;padding:28px 32px}
.stat b{display:block;font-family:'Satoshi','Inter',sans-serif;font-size:72px;line-height:1;
  font-variant-numeric:tabular-nums;color:var(--ds-text-primary);margin-bottom:16px}
.stat span{font-size:24px;line-height:1.35;color:var(--ds-text-secondary)}
table{border-collapse:collapse;width:100%;font-size:28px}
th{text-align:left;font-weight:500;color:var(--ds-text-tertiary);font-size:22px;letter-spacing:.06em;
  text-transform:uppercase;padding:0 24px 18px 0;border-bottom:1px solid var(--ds-border-default)}
td{padding:22px 24px 22px 0;border-bottom:1px solid var(--ds-border-subtle);color:var(--ds-text-secondary);vertical-align:top}
td:first-child{color:var(--ds-text-primary);font-weight:500;white-space:nowrap}
.note{font-size:26px;line-height:1.4;color:var(--ds-text-primary);border-left:3px solid var(--ds-accent-ion);padding-left:24px;max-width:1400px}
.foot{display:flex;justify-content:space-between;gap:48px;font-size:17px;line-height:1.4;color:var(--ds-text-tertiary);
  border-top:1px solid var(--ds-border-subtle);padding-top:20px}
.foot .src{max-width:1500px}
.num{font-variant-numeric:tabular-nums}
`;

const LABEL = {
  verified: 'verified',
  derived: 'derived',
  attested: 'founder-attested',
  opinion: 'opinion',
  metric: 'measured',
};

/** Footnote: each cited source with its status and as-of date. */
export function footnote(slide) {
  const parts = slide.sources.map(source => {
    const date = source.asOf ? String(source.asOf).slice(0, 10) : 'undated';
    return `${LABEL[source.status] ?? source.status} ${date}`;
  });
  const unique = [...new Set(parts)];
  return unique.length
    ? `Sources: ${unique.join('; ')}. Ledger refs: ${slide.sources.map(s => s.ref).join(', ')}.`
    : '';
}

export function renderSlide(slide, index, total) {
  const stats = slide.stats.length
    ? `<div class="stats" style="--cols:${slide.stats.length}">${slide.stats
        .map(
          stat =>
            `<div class="stat"><b>${esc(stat.value)}</b><span>${esc(stat.label)}</span></div>`
        )
        .join('')}</div>`
    : '';
  const table = slide.table
    ? `<table><thead><tr>${slide.table.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${slide.table.rows
        .map(
          row => `<tr>${row.map(cell => `<td>${esc(cell)}</td>`).join('')}</tr>`
        )
        .join('')}</tbody></table>`
    : '';
  const support = slide.support
    .map(line => `<p class="support">${esc(line)}</p>`)
    .join('');
  const note = slide.note ? `<p class="note">${esc(slide.note)}</p>` : '';
  return `<section class="slide ${esc(slide.id)}" data-slide="${esc(slide.id)}">
${slide.kicker ? `<div class="kicker">${esc(slide.kicker)}</div>` : ''}
<h1>${esc(slide.dominantSentence)}</h1>
<div class="body">${stats}${table}${support}${note}</div>
<div class="foot"><span class="src">${esc(footnote(slide))}</span><span class="num">${index + 1} / ${total}</span></div>
</section>`;
}

export function renderDeckHtml(slides, { title, tokens } = {}) {
  const css = [
    fontFace('Inter', FONTS.inter, '100 900'),
    fontFace('Satoshi', FONTS.satoshi, '100 900'),
    tokenCss(tokens),
    DECK_CSS,
  ].join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title ?? 'Jovie')}</title>
<style>@page{size:1920px 1080px;margin:0}${css}</style></head><body>
${slides.map((slide, i) => renderSlide(slide, i, slides.length)).join('\n')}
</body></html>`;
}

/** Plain text of the deck, one block per slide, for lint, consistency and judges. */
export function deckText(slides) {
  return slides
    .map((slide, i) =>
      [
        `SLIDE ${i + 1} (${slide.id})`,
        slide.kicker,
        slide.dominantSentence,
        ...slide.stats.map(stat => `${stat.value}: ${stat.label}`),
        ...(slide.table
          ? [
              slide.table.head.join(' | '),
              ...slide.table.rows.map(row => row.join(' | ')),
            ]
          : []),
        ...slide.support,
        slide.note,
        footnote(slide),
      ]
        .filter(Boolean)
        .join('\n')
    )
    .join('\n\n');
}
