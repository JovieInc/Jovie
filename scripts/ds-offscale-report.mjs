#!/usr/bin/env node
// Design-system off-scale text-size review artifact.
// Scans apps/web for `text-[Npx]` values that are NOT on the type scale and
// emits a self-contained HTML page rendering current vs nearest-token size
// side by side, so a human can make the snap-or-keep taste call.
//
//   node scripts/ds-offscale-report.mjs [outfile.html]
//
// ponytail: one-shot report, no deps, rg does the scan.
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const REPO = new URL('..', import.meta.url).pathname;
const OUT = process.argv[2] || '/tmp/jovie-ds-offscale-review.html';

// px -> tailwind utility, the canonical type scale (apps/web/styles/design-system.css)
const SCALE = [
  [10, 'text-3xs'],
  [11, 'text-2xs'],
  [12, 'text-xs'],
  [13, 'text-app'],
  [14, 'text-sm'],
  [15, 'text-mid'],
  [16, 'text-base'],
  [18, 'text-lg'],
  [20, 'text-xl'],
  [24, 'text-2xl'],
  [30, 'text-3xl'],
  [36, 'text-4xl'],
  [48, 'text-5xl'],
];
const SCALE_PX = new Set(SCALE.map(([px]) => px));

function nearest(px) {
  let best = [],
    bestD = Infinity;
  for (const [p, tok] of SCALE) {
    const d = Math.abs(p - px);
    if (d < bestD) {
      bestD = d;
      best = [[p, tok]];
    } else if (d === bestD) best.push([p, tok]);
  }
  return { options: best, tie: best.length > 1 };
}

// Collect off-scale occurrences: { px -> [{file,line,snippet}] }
let raw = '';
try {
  raw = execSync(
    `rg -n --no-heading -e 'text-\\[[0-9.]+px\\]' apps/web/components apps/web/app`,
    { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  );
} catch (e) {
  raw = e.stdout || '';
}

const byPx = new Map();
for (const ln of raw.split('\n')) {
  const m = ln.match(/^(.+?):(\d+):(.*)$/);
  if (!m) continue;
  const [, file, line, content] = m;
  for (const hit of content.matchAll(/text-\[([0-9.]+)px\]/g)) {
    const px = parseFloat(hit[1]);
    if (SCALE_PX.has(px)) continue; // on-scale, skip
    if (!byPx.has(px)) byPx.set(px, []);
    byPx.get(px).push({
      file: file.replace(/^.*apps\/web\//, 'apps/web/'),
      line,
      snippet: content.trim().slice(0, 160),
    });
  }
}

const sizes = [...byPx.keys()].sort(
  (a, b) => byPx.get(b).length - byPx.get(a).length
);
const total = [...byPx.values()].reduce((n, a) => n + a.length, 0);
const esc = s =>
  s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const SAMPLE = 'Detroit listeners up 340% — book a show';

const cards = sizes
  .map(px => {
    const uses = byPx.get(px);
    const { options, tie } = nearest(px);
    const cols = [
      `<div class="col cur"><span class="tag">current · ${px}px</span><p style="font-size:${px}px">${SAMPLE}</p></div>`,
    ].concat(
      options.map(([p, tok]) => {
        const d = (p - px > 0 ? '+' : '') + (p - px);
        return `<div class="col"><span class="tag">→ ${tok} · ${p}px <em>(${d}px)</em></span><p style="font-size:${p}px">${SAMPLE}</p></div>`;
      })
    );
    const locs = uses
      .slice(0, 40)
      .map(
        u =>
          `<li><code>${esc(u.file)}:${u.line}</code> &nbsp;<span>${esc(u.snippet)}</span></li>`
      )
      .join('');
    return `<section>
    <h2>${px}px <small>· ${uses.length} use${uses.length === 1 ? '' : 's'}</small>
      ${tie ? '<b class="tie">TIE — your call</b>' : `<b class="rec">snap → ${options[0][1]}</b>`}</h2>
    <div class="compare">${cols.join('')}</div>
    <details><summary>${uses.length} location${uses.length === 1 ? '' : 's'}</summary><ul>${locs}${uses.length > 40 ? `<li>… +${uses.length - 40} more</li>` : ''}</ul></details>
  </section>`;
  })
  .join('\n');

const ramp = SCALE.map(
  ([p, t]) => `<span style="font-size:${p}px" title="${t} ${p}px">${p}</span>`
).join(' ');

const html = `<!doctype html><html><head><meta charset="utf8">
<title>Jovie DS — off-scale text sizes</title>
<link rel="preconnect" href="https://rsms.me/"><link rel="stylesheet" href="https://rsms.me/inter/inter.css">
<style>
  :root{font-family:Inter,-apple-system,system-ui,sans-serif}
  body{margin:0;background:#0a0a0b;color:#ededef;padding:32px 40px;line-height:1.4}
  h1{font-size:22px;font-weight:600;letter-spacing:-.02em;margin:0 0 4px}
  .sub{color:#8d8d93;font-size:13px;margin:0 0 28px}
  .ramp{color:#6e6e76;display:flex;gap:14px;align-items:baseline;flex-wrap:wrap;border:1px solid #1c1c20;border-radius:12px;padding:14px 18px;margin-bottom:28px}
  section{border:1px solid #1c1c20;border-radius:14px;padding:18px 20px;margin-bottom:18px;background:#0e0e10}
  h2{font-size:15px;font-weight:600;margin:0 0 14px;display:flex;gap:10px;align-items:center}
  h2 small{color:#8d8d93;font-weight:400}
  b.rec{margin-left:auto;font-size:11px;font-weight:500;color:#43b85c;background:#43b85c1a;padding:2px 8px;border-radius:999px}
  b.tie{margin-left:auto;font-size:11px;font-weight:500;color:#ffab2e;background:#ffab2e1a;padding:2px 8px;border-radius:999px}
  .compare{display:flex;gap:14px;flex-wrap:wrap}
  .col{flex:1;min-width:240px;border:1px solid #1c1c20;border-radius:10px;padding:12px 14px}
  .col.cur{border-color:#33333a}
  .tag{display:block;font-size:11px;color:#8d8d93;margin-bottom:8px}
  .tag em{color:#6e6e76;font-style:normal}
  .col p{margin:0;letter-spacing:-.01em}
  details{margin-top:12px}
  summary{cursor:pointer;color:#8d8d93;font-size:12px}
  ul{margin:10px 0 0;padding-left:18px;max-height:240px;overflow:auto}
  li{font-size:11px;color:#9a9aa2;margin-bottom:4px}
  code{color:#4d7dff}
  li span{color:#5e5e66}
</style></head><body>
<h1>Off-scale text sizes — snap or keep?</h1>
<p class="sub">${total} occurrences across ${sizes.length} non-scale sizes. Each changes rendered size if snapped → a taste call. The type scale, for reference:</p>
<div class="ramp">${ramp}</div>
${cards}
</body></html>`;

writeFileSync(OUT, html);
console.log(`Wrote ${OUT}  (${total} occurrences, ${sizes.length} sizes)`);
