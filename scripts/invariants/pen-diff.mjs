#!/usr/bin/env node
/**
 * Pen-to-code merge gate: pnpm design:pen-diff [--route /] [--base origin/main]
 *   [--base-url http://localhost:3230] [--out pen-diff-out] [--changed-files file]
 * Renders only the bound routes a PR touches (1440 + 390), crops each
 * [data-pen-section], compares with the committed Pen still (SSIM + box).
 * The only baseline is the committed still. Thresholds: pen-diff.config.json.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classifyRoutes,
  compareSection,
  formatReport,
  validateBindings,
} from './pen-diff-lib.mjs';
import { decodePng, encodePng } from './pen-still-diff-lib.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const BINDINGS = 'docs/design-system/pen-bindings.json';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1]
    : fallback;
}
function git(args) {
  const r = spawnSync('git', args, { cwd: REPO, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}
const slug = route =>
  route.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'root';

async function render({ baseUrl, route, viewport, sections, outDir }) {
  const require = createRequire(join(REPO, 'apps/web/package.json'));
  const { chromium } = require('@playwright/test');
  const browser = await chromium.launch();
  try {
    // Real first-visit state: fresh context, no storage, consent banner NOT suppressed.
    const ctx = await browser.newContext({
      viewport: { width: viewport, height: 900 },
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    await page.goto(new URL(route, baseUrl).href, { waitUntil: 'networkidle' });
    await page.addStyleTag({
      content:
        '*{animation:none!important;transition:none!important;caret-color:transparent!important}',
    });
    const banner = await page.locator('[data-testid="cookie-banner"]').count();
    const out = {};
    for (const section of sections) {
      const loc = page.locator(`[data-pen-section="${section}"]`).first();
      if (!(await loc.count())) {
        out[section] = null;
        continue;
      }
      await loc.scrollIntoViewIfNeeded();
      const box = await loc.boundingBox();
      const png = await loc.screenshot({ animations: 'disabled' });
      out[section] = { png, box };
      mkdirSync(outDir, { recursive: true });
      writeFileSync(
        join(outDir, `${slug(route)}-${viewport}-${section}-render.png`),
        png
      );
    }
    return { sections: out, consentBanner: banner > 0 };
  } finally {
    await browser.close();
  }
}

async function main() {
  const config = JSON.parse(
    readFileSync(join(import.meta.dirname, 'pen-diff.config.json'), 'utf8')
  );
  const base = arg('base', 'origin/main');
  const outDir = resolve(arg('out', 'pen-diff-out'));
  const baseUrl = arg('base-url', process.env.PEN_DIFF_BASE_URL);
  const only = arg('route');

  const bindingsPath = join(REPO, BINDINGS);
  const bindings = existsSync(bindingsPath)
    ? JSON.parse(readFileSync(bindingsPath, 'utf8'))
    : { schema: 'jovie.pen-binding/v1', routes: {} };
  const valid = validateBindings(bindings);
  if (!valid.ok) {
    console.error(`FAIL ${BINDINGS} invalid:\n${valid.errors.join('\n')}`);
    process.exit(1);
  }

  const changedFiles = arg('changed-files')
    ? readFileSync(arg('changed-files'), 'utf8').split('\n').filter(Boolean)
    : git(['diff', '--name-only', `${base}...HEAD`])
        .split('\n')
        .filter(Boolean);
  // Local `--route` run: treat that route as touched.
  const touched = only
    ? [
        ...changedFiles,
        ...(bindings.routes[only]?.sources ?? []).map(g =>
          g.replace(/\*\*.*$/, 'x')
        ),
      ]
    : changedFiles;

  if (process.argv.includes('--scope-only')) {
    // Cheap path selector for ci-path-changes: is any bound or scope route touched?
    const r = classifyRoutes({ bindings, config, changedFiles: touched });
    r.failures.push(...r.warnings);
    const infra = changedFiles.some(f =>
      /^(scripts\/invariants\/pen-diff|docs\/pen-stills\/|docs\/design-system\/pen-bindings\.json)/.test(
        f
      )
    );
    console.log(
      r.toCheck.length > 0 || r.failures.length > 0 || infra ? 'true' : 'false'
    );
    return;
  }

  const stillChangedAt = {};
  for (const f of changedFiles.filter(
    p => p.startsWith('docs/pen-stills/') && p.endsWith('.png')
  )) {
    const t = git(['log', '-1', '--format=%cI', `${base}..HEAD`, '--', f]);
    if (t) stillChangedAt[f] = t;
  }
  let { toCheck, failures, warnings } = classifyRoutes({
    bindings,
    config,
    changedFiles: touched,
    stillChangedAt,
  });
  if (only) toCheck = toCheck.filter(r => r.route === only);

  // --policy-only: unbound/stale-approval verdicts without building or rendering.
  // Emits needs_render for the CI job that decides whether to build.
  if (process.argv.includes('--policy-only')) {
    for (const f of failures) console.log(`FAIL ${f.message}`);
    for (const w of warnings) console.log(`ADVISORY ${w.message}`);
    if (process.env.GITHUB_OUTPUT)
      appendFileSync(
        process.env.GITHUB_OUTPUT,
        `needs_render=${toCheck.length > 0 && failures.length === 0}\n`
      );
    console.log(
      `pen-diff policy: ${toCheck.length} bound route(s) to render, ${failures.length} failure(s)`
    );
    process.exit(failures.length ? 1 : 0);
  }

  const results = [];
  for (const { route, entry, enforced } of toCheck) {
    for (const viewport of config.viewports) {
      const frames = entry.viewports?.[String(viewport)] ?? [];
      if (!frames.length) continue;
      for (const f of frames) {
        const p = join(REPO, f.still);
        const res = {
          enforced,
          route,
          viewport,
          section: f.section,
          ssimMin: config.thresholds.ssimMin,
          boxMax: config.thresholds.boxAspectTolerance,
        };
        if (!existsSync(p)) {
          results.push({
            ...res,
            pass: false,
            reason: `still missing: ${f.still}`,
          });
          continue;
        }
        if (
          f.sha256 &&
          createHash('sha256').update(readFileSync(p)).digest('hex') !==
            f.sha256
        )
          results.push({
            ...res,
            pass: false,
            reason: `still sha256 differs from binding (${f.still}); re-approve`,
          });
      }
      if (
        results.some(
          r => r.route === route && r.viewport === viewport && r.reason
        )
      )
        continue;
      if (!baseUrl) {
        (enforced ? failures : warnings).push({
          route,
          enforced,
          message: `${route}: --base-url (or PEN_DIFF_BASE_URL) required to render`,
        });
        continue;
      }
      const rendered = await render({
        baseUrl,
        route,
        viewport,
        sections: frames.map(f => f.section),
        outDir,
      });
      for (const f of frames) {
        const res = {
          enforced,
          route,
          viewport,
          section: f.section,
          ssimMin: config.thresholds.ssimMin,
          boxMax: config.thresholds.boxAspectTolerance,
          consentBanner: rendered.consentBanner,
        };
        const got = rendered.sections[f.section];
        if (!got) {
          results.push({
            ...res,
            pass: false,
            reason: `no [data-pen-section="${f.section}"] in rendered page`,
          });
          continue;
        }
        const c = compareSection(
          {
            still: decodePng(readFileSync(join(REPO, f.still))),
            render: decodePng(got.png),
            box: got.box,
          },
          config.thresholds
        );
        const diffPath = join(
          outDir,
          `${slug(route)}-${viewport}-${f.section}-diff.png`
        );
        writeFileSync(diffPath, encodePng(c.diff));
        results.push({
          ...res,
          pass: c.pass,
          ssim: c.ssim,
          box: c.box,
          diffPath,
        });
      }
    }
  }
  const ok =
    failures.length === 0 && results.every(r => r.pass || r.enforced === false);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, 'receipt.json'),
    `${JSON.stringify({ ok, failures, warnings, results: results.map(({ diff, ...r }) => r) }, null, 2)}\n`
  );
  const text = formatReport(results, failures, warnings);
  console.log(
    text ||
      `pen-diff: no bound or scope route touched (${changedFiles.length} files)`
  );
  if (!ok) process.exit(1);
}

main().catch(e => {
  console.error(e.stack ?? e.message);
  process.exit(1);
});
