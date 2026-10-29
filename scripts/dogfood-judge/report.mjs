// Self-contained HTML report for a judged run: per step the Pen reference
// beside the run frame, then every finding with its crop, timestamp,
// criterion and severity. Images are embedded (downscaled JPEG) so the file
// can be published as one artifact. Colors come from design.tokens.json
// semantic roles, dark first.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO_ROOT } from './registry.mjs';
import { CRITERIA } from './rubric.mjs';

const esc = value =>
  String(value ?? '').replace(
    /[&<>"']/gu,
    ch =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        ch
      ]
  );

function tokens() {
  const raw = JSON.parse(
    readFileSync(join(REPO_ROOT, 'design.tokens.json'), 'utf8')
  ).color;
  const v = node => node?.$value ?? node?.value;
  return {
    canvas: v(raw['surface.canvas']),
    panel: v(raw['surface.panel']),
    elevated: v(raw['surface.elevated']),
    text: v(raw['text.primary']),
    textSecondary: v(raw['text.secondary']),
    textTertiary: v(raw['text.quaternary']),
    border: v(raw['border.subtle']),
    borderDefault: v(raw['border.default']),
    accent: v(raw['accent.ion']),
    success: v(raw['status.success']),
    warning: v(raw['status.warning']),
    error: v(raw['status.error']),
  };
}

function embed(path, width = 900) {
  if (!path || !existsSync(path)) return null;
  const dir = mkdtempSync(join(tmpdir(), 'djr-'));
  try {
    const out = join(dir, 'x.jpg');
    const result = spawnSync(
      'ffmpeg',
      [
        '-hide_banner',
        '-y',
        '-i',
        path,
        '-vf',
        `scale='min(${width},iw)':-2`,
        '-q:v',
        '4',
        out,
      ],
      { encoding: 'utf8' }
    );
    if (result.status !== 0 || !existsSync(out)) return null;
    return `data:image/jpeg;base64,${readFileSync(out).toString('base64')}`;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const fmtT = t =>
  t == null
    ? ''
    : `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export function renderReport({ receipt, penRefs, title }) {
  const t = tokens();
  const criteria = new Map(CRITERIA.map(c => [c.id, c]));
  const penFor = stepId =>
    penRefs.find(ref => ref.absPath && ref.steps?.includes(stepId)) ?? null;
  const all = receipt.steps.flatMap(s => s.findings);
  const counts = { blocker: 0, major: 0, minor: 0 };
  for (const f of all) counts[f.severity] += 1;
  const failing = receipt.steps.filter(s => s.verdict === 'fail').length;

  const stepHtml = receipt.steps
    .map(step => {
      const pen = penFor(step.id);
      const frame =
        step.images.find(i => i.source === 'step-screenshot') ?? step.images[0];
      const penImg = pen ? embed(pen.absPath, 700) : null;
      const runImg = frame ? embed(frame.path, 700) : null;
      const findings = step.findings
        .map(f => {
          const crop = embed(f.crop, 520);
          const c = criteria.get(f.criterion);
          return `<li class="f">
  <div class="fh"><span class="sev ${f.severity}">${f.severity}</span><span class="crit">${esc(f.criterion)} ${esc(c?.title ?? '')}</span><span class="ts">${esc(f.video ? `${f.video} ${fmtT(f.t)}` : fmtT(f.t))}</span></div>
  <p class="d">${esc(f.detail)}</p>
  <p class="e">“${esc(f.evidence)}”</p>
  <p class="fix">Fix: ${esc(f.fix)}</p>
  ${crop ? `<img class="crop" alt="crop for ${esc(f.id)}" src="${crop}">` : ''}
</li>`;
        })
        .join('\n');
      return `<section class="step">
  <header><h2>${esc(step.id)} · ${esc(step.title)}</h2><span class="verdict ${step.verdict}">${step.verdict}</span></header>
  <p class="quote">${esc(step.timQuote)}</p>
  <div class="pair">
    <figure><figcaption>Pen ${esc(pen ? `${pen.id} · ${pen.title}` : 'reference not registered')}</figcaption>${penImg ? `<img alt="Pen reference" src="${penImg}">` : '<div class="none">No Pen frame</div>'}</figure>
    <figure><figcaption>Run ${esc(frame?.name ?? '')} ${esc(fmtT(frame?.t))}</figcaption>${runImg ? `<img alt="Run frame" src="${runImg}">` : '<div class="none">No frame</div>'}</figure>
  </div>
  <p class="pen">Pen gap ${esc(step.penGap)}/10. ${esc(step.penSummary)}</p>
  ${findings ? `<ol class="findings">${findings}</ol>` : '<p class="clean">No findings.</p>'}
</section>`;
    })
    .join('\n');

  const unjudged = receipt.unjudgeable
    .map(
      s =>
        `<li><b>${esc(s.id)}</b> ${esc(s.title)}: ${esc(s.note || s.reason)}</li>`
    )
    .join('');

  return `<title>${esc(title)}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
:root{color-scheme:dark;--canvas:${t.canvas};--panel:${t.panel};--elevated:${t.elevated};--text:${t.text};--text-2:${t.textSecondary};--text-3:${t.textTertiary};--border:${t.border};--border-2:${t.borderDefault};--accent:${t.accent};--ok:${t.success};--warn:${t.warning};--err:${t.error}}
*{box-sizing:border-box}body{margin:0;background:var(--canvas);color:var(--text);font:14px/1.5 Inter,ui-sans-serif,system-ui,sans-serif}
main{max-width:1180px;margin:0 auto;padding-block:40px 80px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}\n.pair figure,.f{min-width:0}
h1{font-size:22px;font-weight:600;margin:0 0 4px;text-wrap:balance}h2{font-size:15px;font-weight:600;margin:0}
.sub{color:var(--text-2);margin:0 0 24px}
.kpis{display:flex;gap:32px;flex-wrap:wrap;padding:16px 0;border-top:1px solid var(--border);border-bottom:1px solid var(--border);margin-bottom:32px}
.kpi b{display:block;font-size:20px;font-weight:600;font-variant-numeric:tabular-nums}.kpi span{color:var(--text-3);font-size:12px}
.step{padding:28px 0;border-bottom:1px solid var(--border)}
.step header{display:flex;justify-content:space-between;align-items:baseline;gap:16px}
.verdict{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.04em}.verdict.fail{color:var(--err)}.verdict.pass{color:var(--ok)}
.quote{color:var(--text-2);margin:6px 0 16px;font-style:italic}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media (max-width:760px){.pair{grid-template-columns:1fr}}
figure{margin:0}figcaption{color:var(--text-3);font-size:12px;margin-bottom:6px}
figure img{width:100%;height:auto;display:block;border-radius:8px;background:var(--panel)}
.none{height:120px;display:grid;place-items:center;color:var(--text-3);background:var(--panel);border-radius:8px}
.pen{color:var(--text-2);margin:12px 0}
.findings{list-style:none;margin:0;padding:0;display:grid;gap:12px}
.f{background:var(--panel);border-radius:8px;padding:12px 14px}
.fh{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}
.sev{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em}.sev.blocker{color:var(--err)}.sev.major{color:var(--warn)}.sev.minor{color:var(--text-3)}
.crit{font-weight:600}.ts{margin-left:auto;color:var(--text-3);font-size:12px;font-variant-numeric:tabular-nums}
.d{margin:6px 0 2px}.e{margin:0;color:var(--text-2)}.fix{margin:2px 0 0;color:var(--accent)}
.crop{margin-top:10px;max-width:100%;max-height:220px;border-radius:6px;display:block}
.clean{color:var(--ok)}
ul.unj{color:var(--text-2)}
</style><main>
<h1>${esc(title)}</h1>
<p class="sub">${esc(receipt.surface)} · ${esc(receipt.rubricVersion)} · judged ${esc(receipt.judgedAt)} · screen ${esc(receipt.tiers.screen)}, confirm ${esc(receipt.tiers.confirm)}</p>
<div class="kpis">
<div class="kpi"><b class="verdict ${receipt.verdict}">${receipt.verdict}</b><span>Verdict</span></div>
<div class="kpi"><b>${failing}/${receipt.steps.length}</b><span>Steps failing</span></div>
<div class="kpi"><b>${counts.blocker}</b><span>Blockers</span></div>
<div class="kpi"><b>${counts.major}</b><span>Major</span></div>
<div class="kpi"><b>${counts.minor}</b><span>Minor</span></div>
<div class="kpi"><b>$${receipt.costUsd.toFixed(2)}</b><span>Judge cost</span></div>
</div>
${stepHtml}
${unjudged ? `<section class="step"><header><h2>Not recorded, so not passable</h2><span class="verdict fail">fail</span></header><ul class="unj">${unjudged}</ul></section>` : ''}
</main>
`;
}
