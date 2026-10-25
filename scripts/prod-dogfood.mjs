#!/usr/bin/env node
// Production dogfood agent. Exercises real public journeys on production like
// a user (Playwright request context + browser), emits SHA-bound dogfood
// receipts and a certification roll-up, and files deduped Linear issues for
// every defect it finds; issues close themselves when the check passes again.
// Flags: --out DIR, --no-file (dry run), --metrics-only, --auth-checks FILE, --ingest URL.
// Read-only on production: GETs and page loads of public surfaces; authenticated
// journeys come from the separate Playwright spec.
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { linearRequest } from './lib/linear-cooldown.mjs';
import {
  closeLinearIssueByFingerprint,
  ensureLinearLabel,
  JOVIE_TEAM_ID,
  remediationTriggersEnabled,
  upsertLinearIssueByTitleFingerprint,
} from './lib/linear-issue-intake.mjs';
import {
  buildReceipt,
  certificationState,
  findingIssue,
  fingerprintFor,
  MISSIONS,
  weeklyDefectMetrics,
} from './lib/prod-dogfood.mjs';
import {
  checkBuildBinding,
  checkDestinations,
  checkProfile,
  checkPublicSurfaces,
  checkPublishedLinks,
  checkReleasePages,
  checkShareImages,
  checkSitemap,
  extractLinksFromText,
  extractShortDescription,
  extractVideoIds,
  hasErrorShell,
  mapLimit,
  PROBE_CONCURRENCY,
  sameAsUrls,
} from './lib/prod-dogfood-checks.mjs';
import {
  expectationFor,
  reviewScreenshot,
  selectVisionProvider,
  sumUsage,
  visionChecksFor,
} from './lib/prod-dogfood-vision.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const UA = 'JovieDogfood/1.0 (+https://jov.ie; read-only production check)';

function parseArgs(argv) {
  const args = {
    out: 'out/prod-dogfood',
    file: true,
    browser: true,
    metricsOnly: false,
    runUrl: process.env.RUN_URL ?? '',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') args.out = argv[++i];
    else if (a === '--base') args.base = argv[++i];
    else if (a === '--no-file') args.file = false;
    else if (a === '--no-browser') args.browser = false;
    else if (a === '--metrics-only') args.metricsOnly = true;
    else if (a === '--run-url') args.runUrl = argv[++i];
    else if (a === '--auth-checks') args.authChecks = argv[++i];
    else if (a === '--ingest') args.ingest = argv[++i];
  }
  return args;
}

function loadPlaywright() {
  const require = createRequire(path.join(REPO, 'apps/web/package.json'));
  return require('playwright');
}

function makeProbe(requestContext) {
  return async function probe(url) {
    let last = { status: 0, finalUrl: url, text: '', error: 'no attempt' };
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await requestContext.get(url, {
          maxRedirects: 5,
          timeout: 30_000,
          failOnStatusCode: false,
        });
        const status = res.status();
        let text = '';
        const type = res.headers()['content-type'] ?? '';
        if (/text|json|xml|html/i.test(type)) text = await res.text();
        last = { status, finalUrl: res.url(), text, contentType: type };
        if (status < 500) return last;
      } catch (error) {
        last = {
          status: 0,
          finalUrl: url,
          text: '',
          error: String(error?.message ?? error).split('\n')[0],
        };
      }
    }
    return last;
  };
}

function slugify(url) {
  return (
    new URL(url).pathname
      .replace(/^\/|\/$/g, '')
      .replace(/[^a-z0-9]+/gi, '-') || 'home'
  );
}

/** Rendered-UI check: what a person would see, at each viewport. */
async function renderedChecks({ browser, urls, viewports, outDir }) {
  const checks = [];
  const shots = [];
  mkdirSync(path.join(outDir, 'screens'), { recursive: true });
  for (const url of urls) {
    for (const vp of viewports) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        userAgent: UA,
      });
      const page = await context.newPage();
      const pageErrors = [];
      const failed = [];
      page.on('pageerror', e =>
        pageErrors.push(String(e.message).slice(0, 200))
      );
      page.on('response', r => {
        const u = r.url();
        if (
          r.status() >= 400 &&
          new URL(u).origin === new URL(url).origin &&
          !/\/_vercel\/|favicon/.test(u)
        )
          failed.push(`${r.status()} ${new URL(u).pathname}`);
      });
      const target = `${url}#${vp.name}`;
      try {
        await page.goto(url, { waitUntil: 'load', timeout: 45_000 });
        await page
          .waitForLoadState('networkidle', { timeout: 15_000 })
          .catch(() => {});
        const facts = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth - window.innerWidth,
          broken: [...document.images]
            .filter(
              i => i.complete && i.naturalWidth === 0 && i.offsetParent !== null
            )
            .map(i => (i.currentSrc || i.src).slice(0, 120)),
          text: (document.body?.innerText ?? '').slice(0, 4000),
          textLength: (document.body?.innerText ?? '').trim().length,
        }));
        const shot = path.join('screens', `${slugify(url)}-${vp.name}.png`);
        await page.screenshot({
          path: path.join(outDir, shot),
          fullPage: false,
        });
        shots.push({
          url,
          viewport: vp.name,
          file: shot,
          page:
            new URL(url).pathname.split('/').filter(Boolean).length > 1
              ? 'release'
              : 'profile',
          mission: 'dogfood:rendered-public-ui',
        });
        const problems = [];
        if (pageErrors.length)
          problems.push(`page errors: ${pageErrors.slice(0, 3).join(' | ')}`);
        if (failed.length)
          problems.push(
            `same-origin failures: ${[...new Set(failed)].slice(0, 5).join(', ')}`
          );
        if (facts.broken.length)
          problems.push(
            `broken images: ${facts.broken.slice(0, 3).join(', ')}`
          );
        if (facts.overflow > 2)
          problems.push(`horizontal overflow ${facts.overflow}px`);
        if (hasErrorShell(facts.text))
          problems.push('error text visible on page');
        if (facts.textLength < 60)
          problems.push(`page is nearly empty (${facts.textLength} chars)`);
        if (problems.length) {
          checks.push({
            id: 'rendered-clean',
            target,
            status: 'failed',
            severity: 'P2',
            summary: `${new URL(url).pathname} renders with defects at ${vp.name} width`,
            expected:
              'no page errors, 4xx/5xx, broken images, overflow or error text',
            actual: problems.join('; '),
            url,
            screenshot: shot,
          });
        } else {
          checks.push({
            id: 'rendered-clean',
            target,
            status: 'passed',
            summary: `${new URL(url).pathname} clean at ${vp.name}`,
            screenshot: shot,
          });
        }
      } catch (error) {
        checks.push({
          id: 'rendered-clean',
          target,
          status: 'failed',
          severity: 'P1',
          summary: `${new URL(url).pathname} failed to render at ${vp.name} width`,
          expected: 'page loads',
          actual: String(error?.message ?? error).split('\n')[0],
          url,
        });
      } finally {
        await context.close();
      }
    }
  }
  return { checks, shots };
}

/**
 * Links the artist published on their own YouTube channel. The Atom feed now
 * 404s, so read the channel's videos page and each watch page description.
 */
/** What a fan does on the profile: switch tabs, open Get Updates (never submit). */
async function profileInteractionChecks({ browser, base, handle, outDir }) {
  const url = `${base}/${handle}`;
  const checks = [];
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: UA,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message).slice(0, 160)));
  const bodyText = () => page.evaluate(() => document.body.innerText);
  const record = (step, ok, actual) =>
    checks.push(
      ok
        ? {
            id: 'profile-interactions',
            target: `${url}#${step}`,
            status: 'passed',
            summary: `${step} ok`,
          }
        : {
            id: 'profile-interactions',
            target: `${url}#${step}`,
            status: 'failed',
            severity: 'P1',
            summary: `profile interaction failed: ${step}`,
            expected: 'the view responds',
            actual,
            url,
          }
    );
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 45_000 });
    await page
      .waitForLoadState('networkidle', { timeout: 15_000 })
      .catch(() => {});
    const home = await bodyText();
    for (const [tab, marker] of [
      ['Music', /latest single|single|album|ep/i],
      ['Events', /events/i],
      ['About', /about/i],
    ]) {
      const button = page
        .getByRole('button', { name: tab, exact: true })
        .first();
      if (!(await button.count())) {
        record(`tab-${tab}`, false, `no "${tab}" tab button`);
        continue;
      }
      await button.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(800);
      const text = await bodyText();
      record(
        `tab-${tab}`,
        text !== home && marker.test(text),
        `view unchanged or missing ${tab} content`
      );
    }
    await page
      .getByRole('button', { name: 'Home', exact: true })
      .first()
      .click({ timeout: 5000 })
      .catch(() => {});
    const subscribe = page
      .getByRole('button', { name: 'Get Updates', exact: true })
      .first();
    await subscribe.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(800);
    const emailInputs = await page
      .locator('input[type=email],input[name=email]')
      .count();
    record(
      'get-updates-opens-email-capture',
      emailInputs > 0,
      'no email input after clicking Get Updates'
    );
    record(
      'no-page-errors',
      errors.length === 0,
      errors.slice(0, 3).join(' | ')
    );
  } catch (error) {
    record(
      'profile-load',
      false,
      String(error?.message ?? error).split('\n')[0]
    );
  } finally {
    await context.close();
  }
  return checks;
}

async function fetchYoutubeLinks(probe, handle) {
  const links = [];
  const gaps = [];
  const channel = await probe(`https://www.youtube.com/@${handle}/videos`);
  if (channel.status !== 200)
    return {
      links,
      gaps: [`YouTube @${handle}/videos: HTTP ${channel.status}`],
    };
  const ids = extractVideoIds(channel.text);
  if (ids.length === 0)
    gaps.push(`YouTube @${handle}/videos: no video ids parsed`);
  const watched = await mapLimit(ids, PROBE_CONCURRENCY, async id => ({
    id,
    res: await probe(`https://www.youtube.com/watch?v=${id}`),
  }));
  for (const { id, res } of watched) {
    if (res.status !== 200) {
      gaps.push(`YouTube watch ${id}: HTTP ${res.status}`);
      continue;
    }
    links.push(
      ...extractLinksFromText(extractShortDescription(res.text), {
        source: `YouTube ${id}`,
      })
    );
  }
  return { links, gaps };
}

// The team filter is an IDComparator: the variable must be ID!, not String!
// (Linear rejects String! with HTTP 400, which once made filing, auto-close and
// the metric silently never run). Guarded by prod-dogfood-filer.test.mjs.
export const DEFECT_ROWS_QUERY = `query($team:ID!,$since:DateTimeOrDuration!,$after:String){ issues(first:100, after:$after, filter:{ team:{id:{eq:$team}}, createdAt:{gte:$since}, labels:{ name:{ in:["dogfood-agent","escaped-defect"] } } }){ pageInfo{hasNextPage endCursor} nodes{ identifier createdAt labels{nodes{name}} } } }`;
export const OPEN_ISSUES_QUERY = `query($team:ID!,$after:String){ issues(first:100, after:$after, filter:{ team:{id:{eq:$team}}, labels:{name:{eq:"dogfood-agent"}}, state:{type:{nin:["completed","canceled"]}} }){ pageInfo{hasNextPage endCursor} nodes{ identifier title url } } }`;

/** 0 clean, 2 defects found and filed, 3 the filer itself failed (loud, never silent). */
export function exitCodeFor({ findings, filerFailures }) {
  if (filerFailures.length > 0) return 3;
  return findings > 0 ? 2 : 0;
}

/** Why a Linear call failed, including the GraphQL error text when there is one. */
export function linearFailureReason(result) {
  const message = result.data?.errors?.[0]?.message;
  const base = result.reason ?? `status ${result.status}`;
  return message ? `${base}: ${String(message).slice(0, 160)}` : base;
}

export async function linearDefectRows({
  apiKey,
  weeks = 5,
  fetchImpl = fetch,
}) {
  const since = new Date(Date.now() - weeks * 7 * 86_400_000).toISOString();
  const rows = [];
  let after = null;
  for (let page = 0; page < 10; page++) {
    const result = await linearRequest({
      key: apiKey,
      query: DEFECT_ROWS_QUERY,
      variables: { team: JOVIE_TEAM_ID, since, after },
      fetchImpl,
    });
    const data = result.data?.data?.issues;
    if (!result.ok || !data)
      return {
        ok: false,
        rows,
        reason: linearFailureReason(result),
      };
    rows.push(
      ...data.nodes.map(n => ({
        id: n.identifier,
        createdAt: n.createdAt,
        labels: n.labels.nodes.map(l => l.name),
      }))
    );
    if (!data.pageInfo.hasNextPage) break;
    after = data.pageInfo.endCursor;
  }
  return { ok: true, rows };
}

export async function openDogfoodIssues({ apiKey, fetchImpl = fetch }) {
  const out = [];
  let after = null;
  for (let page = 0; page < 5; page++) {
    const result = await linearRequest({
      key: apiKey,
      query: OPEN_ISSUES_QUERY,
      variables: { team: JOVIE_TEAM_ID, after },
      fetchImpl,
    });
    const data = result.data?.data?.issues;
    if (!result.ok || !data)
      return { ok: false, reason: linearFailureReason(result) };
    out.push(...data.nodes);
    if (!data.pageInfo.hasNextPage) break;
    after = data.pageInfo.endCursor;
  }
  return { ok: true, issues: out };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const fixtures = JSON.parse(
    readFileSync(path.join(HERE, 'prod-dogfood/fixtures.json'), 'utf8')
  );
  const base = (args.base ?? fixtures.base).replace(/\/$/, '');
  const apiKey = process.env.LINEAR_API_KEY ?? '';
  const outDir = path.resolve(args.out);
  mkdirSync(outDir, { recursive: true });

  if (args.metricsOnly) {
    const got = await linearDefectRows({ apiKey });
    if (!got.ok) throw new Error(`metrics unavailable: ${got.reason}`);
    console.log(JSON.stringify(weeklyDefectMetrics(got.rows), null, 2));
    return;
  }

  const startedAt = new Date().toISOString();
  const pw = loadPlaywright();
  const requestContext = await pw.request.newContext({
    userAgent: UA,
    extraHTTPHeaders: { accept: 'text/html,application/json,*/*' },
  });
  const probe = makeProbe(requestContext);

  // 1. Bind to the exact deploy being served; re-read at the end.
  const bound = await checkBuildBinding({ probe, base });
  const results = new Map(); // mission id -> checks
  const evidence = [];
  if (!bound.binding) {
    console.error(
      'cannot bind receipts to a deployment; nothing can be certified this run'
    );
    writeFileSync(
      path.join(outDir, 'findings.json'),
      JSON.stringify([bound.check], null, 2)
    );
    process.exitCode = 1;
    return;
  }
  const binding = bound.binding;
  results.set('dogfood:public-profile', [bound.check]);

  // 2. Public profile + every release page + destinations.
  const profile = await checkProfile({ probe, base, artist: fixtures.artist });
  results.get('dogfood:public-profile').push(...profile.checks);
  const releaseChecks = await checkReleasePages({
    probe,
    base,
    releaseUrls: profile.releaseUrls,
  });
  const dsts = [
    ...new Set([
      ...sameAsUrls(profile.html),
      ...releaseChecks.flatMap(c => c.destinations ?? []),
    ]),
  ];
  const destinationChecks = await checkDestinations({ probe, urls: dsts });
  const shareChecks = await checkShareImages({
    probe,
    urls: [`${base}/${fixtures.artist.handle}`, ...profile.releaseUrls],
  });
  results.set('dogfood:release-landing', [
    ...releaseChecks,
    ...destinationChecks,
    ...shareChecks,
  ]);

  // 3. Links the artist published off-platform (YouTube feeds + fixtures).
  const feeds = await fetchYoutubeLinks(probe, fixtures.artist.youtubeHandle);
  const published = [...fixtures.publishedLinks, ...feeds.links].filter(l =>
    l.url.startsWith(base)
  );
  results.set(
    'dogfood:published-links',
    await checkPublishedLinks({ probe, base, links: published })
  );
  if (feeds.gaps.length) evidence.push(...feeds.gaps);

  // 4. Public surfaces.
  results.set(
    'dogfood:public-surfaces',
    await checkPublicSurfaces({
      probe,
      base,
      surfaces: fixtures.publicSurfaces,
    })
  );
  results.set('dogfood:sitemap-integrity', await checkSitemap({ probe, base }));

  // 5. Rendered UI (what a person sees).
  let shots = [];
  if (args.browser) {
    const browser = await pw.chromium.launch();
    try {
      const urls = [
        `${base}/${fixtures.artist.handle}`,
        ...profile.releaseUrls.slice(0, fixtures.rendered.maxReleasePages),
      ];
      const rendered = await renderedChecks({
        browser,
        urls,
        viewports: fixtures.rendered.viewports,
        outDir,
      });
      results.set('dogfood:rendered-public-ui', rendered.checks);
      results.set(
        'dogfood:profile-interactions',
        await profileInteractionChecks({
          browser,
          base,
          handle: fixtures.artist.handle,
          outDir,
        })
      );
      shots = rendered.shots;
    } finally {
      await browser.close();
    }
  }

  // 5b. LogYourBody public web (read-only).
  results.set(
    'dogfood:lyb-web-public',
    await checkPublicSurfaces({
      probe,
      base: fixtures.lyb.base,
      surfaces: fixtures.lyb.publicSurfaces,
    })
  );

  // 5c. Authenticated journeys: written by tests/e2e/prod-dogfood-auth.spec.ts
  // (sanctioned creator-ready identity, same OTP source as the auth smoke).
  if (args.authChecks && existsSync(args.authChecks)) {
    const auth = JSON.parse(readFileSync(args.authChecks, 'utf8'));
    for (const check of auth.checks) {
      results.set(check.mission, [
        ...(results.get(check.mission) ?? []),
        check,
      ]);
      if (check.screenshot)
        shots.push({
          url: check.url ?? `${auth.origin}/`,
          viewport: check.target.split('#').pop(),
          file: check.screenshot,
          page: check.page,
          mission: check.mission,
        });
    }
  } else {
    evidence.push('authenticated journeys not run (no auth checks file)');
  }

  // 5d. Automated vision review of every screenshot (cheap model, confirmed findings only).
  const visionProvider = selectVisionProvider(process.env);
  let visionUsage = null;
  if (process.env.DOGFOOD_VISION === '0') {
    evidence.push(
      'vision review skipped: already reviewed for this deployed SHA'
    );
  } else if (!visionProvider) {
    evidence.push(
      'vision review not run: no CLOUDFLARE_WORKERS_AI_TOKEN or AI_GATEWAY_API_KEY'
    );
  } else {
    const max = Number(process.env.DOGFOOD_VISION_MAX ?? 24);
    const picked = shots.slice(0, max);
    const reviews = await mapLimit(picked, 3, async shot => {
      const withExpectation = {
        ...shot,
        expectation: expectationFor(shot.page),
      };
      const review = await reviewScreenshot({
        bytes: readFileSync(path.join(outDir, shot.file)),
        expectation: withExpectation.expectation,
        viewport: shot.viewport,
        provider: visionProvider,
      });
      return { shot: withExpectation, review };
    });
    for (const { shot, review } of reviews) {
      const vchecks = visionChecksFor({ shot, review });
      results.set(shot.mission, [
        ...(results.get(shot.mission) ?? []),
        ...vchecks,
      ]);
    }
    visionUsage = sumUsage(reviews.map(r => r.review));
    evidence.push(
      `vision review (${visionProvider.id}): ${picked.length} screenshots, ${visionUsage.calls} calls, ${visionUsage.prompt_tokens} prompt + ${visionUsage.completion_tokens} completion tokens, $${visionUsage.usd.toFixed(5)} (${(visionUsage.usd / Math.max(picked.length, 1)).toFixed(6)} per verdict)`
    );
  }

  // 6. A deploy that moved mid-run cannot certify anything.
  const after = await checkBuildBinding({ probe, base });
  const superseded =
    !after.binding || after.binding.commitSha !== binding.commitSha;
  await requestContext.dispose();
  const completedAt = new Date().toISOString();

  // 7. Receipts, certification, findings.
  const receipts = [];
  const findings = [];
  for (const mission of MISSIONS) {
    const checks = results.get(mission.id) ?? [];
    const receipt = buildReceipt({
      mission,
      checks,
      binding,
      startedAt,
      completedAt,
      evidenceRefs: [
        `checks:${mission.id}`,
        ...(args.runUrl ? [args.runUrl] : []),
      ],
    });
    if (superseded && receipt.outcome === 'passed') {
      receipt.outcome = 'blocked';
      receipt.blocker = `deploy moved during the run (${binding.commitSha.slice(0, 10)} -> ${after.binding?.commitSha?.slice(0, 10) ?? 'unknown'}); re-run to certify`;
    }
    receipts.push(receipt);
    for (const check of checks.filter(c => c.status === 'failed'))
      findings.push({ mission, check });
  }
  const certification = certificationState({
    receipts,
    servedSha: after.binding?.commitSha ?? binding.commitSha,
    generatedAt: completedAt,
  });
  const allChecks = [...results.values()].flat();
  writeFileSync(
    path.join(outDir, 'receipts.jsonl'),
    `${receipts.map(r => JSON.stringify(r)).join('\n')}\n`
  );
  writeFileSync(
    path.join(outDir, 'certification.json'),
    `${JSON.stringify(certification, null, 2)}\n`
  );
  writeFileSync(
    path.join(outDir, 'checks.json'),
    `${JSON.stringify({ binding, superseded, evidence, shots, checks: allChecks }, null, 2)}\n`
  );

  // 7b. Ingest into Ovie (Shipping > Production certification). CRON_SECRET comes
  // from the same Doppler config the synthetic probes use; never printed.
  const ingestNotes = [];
  if (args.ingest && process.env.CRON_SECRET) {
    try {
      const res = await fetch(args.ingest, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${process.env.CRON_SECRET}`,
        },
        body: JSON.stringify({
          generatedAt: certification.generatedAt,
          servedSha: certification.servedSha,
          runUrl: args.runUrl || null,
          missions: certification.missions,
          receipts,
        }),
      });
      ingestNotes.push(
        `Ovie ingest: HTTP ${res.status}${res.ok ? '' : ` ${(await res.text()).slice(0, 200)}`}`
      );
    } catch (error) {
      ingestNotes.push(
        `Ovie ingest failed: ${String(error?.message ?? error).split('\n')[0]}`
      );
    }
  } else if (args.ingest)
    ingestNotes.push('Ovie ingest skipped: no CRON_SECRET');

  // 8. File deduped Linear issues; close those whose check now passes.
  const filed = [];
  const closed = [];
  const filingNotes = [];
  const filerFailures = [];
  const failFiler = message => {
    filerFailures.push(message);
    console.error(`::error title=prod-dogfood filer::${message}`);
  };
  const failingFps = new Set(
    findings.map(f =>
      fingerprintFor({
        mission: f.mission.id,
        check: f.check.id,
        target: f.check.target,
      })
    )
  );
  const ranFps = new Set(
    allChecks
      .filter(c => c.status !== 'unverified')
      .map(c => {
        const m = MISSIONS.find(mm => (results.get(mm.id) ?? []).includes(c));
        return fingerprintFor({
          mission: m?.id ?? 'unknown',
          check: c.id,
          target: c.target,
        });
      })
  );
  if (
    args.file &&
    apiKey &&
    remediationTriggersEnabled(process.env) &&
    !superseded
  ) {
    const labelIds = [];
    for (const [name, color] of [
      ['dogfood-agent', '#10B981'],
      ['Bug', '#EB5757'],
      ['agent-ready', '#4EA7FC'],
    ]) {
      const l = await ensureLinearLabel({
        name,
        apiKey,
        fetchImpl: fetch,
        color,
      });
      if (l.ok && l.id) labelIds.push(l.id);
    }
    for (const { mission, check } of findings) {
      const artifactNote = check.screenshot
        ? `screenshot ${check.screenshot} in the run artifact "prod-dogfood"`
        : 'check results in the run artifact "prod-dogfood"';
      const issue = findingIssue({
        check,
        mission,
        binding,
        runUrl: args.runUrl,
        artifactNote,
      });
      const res = await upsertLinearIssueByTitleFingerprint({
        fingerprint: issue.fingerprint,
        labelKey: issue.fingerprint,
        title: issue.title,
        description: issue.description,
        priority: issue.priority,
        createStateName: 'Todo',
        createLabelIds: labelIds,
        keepLabelIds: labelIds.slice(0, 1),
        reopenTerminal: true,
        apiKey,
      });
      if (!res.ok)
        failFiler(`could not file ${issue.fingerprint}: ${res.reason}`);
      filed.push({
        fingerprint: issue.fingerprint,
        ok: res.ok,
        action: res.action,
        id: res.identifier ?? res.issue?.identifier ?? null,
        reason: res.reason,
      });
    }
    const open = await openDogfoodIssues({ apiKey });
    if (open.ok) {
      for (const issue of open.issues) {
        const fp = /^\[(dogfood-[a-z0-9-]+)\]/.exec(issue.title)?.[1];
        if (!fp || failingFps.has(fp) || !ranFps.has(fp)) continue;
        const res = await closeLinearIssueByFingerprint({
          fingerprint: fp,
          labelKey: fp,
          comment: `Verified passing on production at ${binding.commitSha} (${binding.deploymentId}) by the dogfood agent. ${args.runUrl}`,
          runId: process.env.GITHUB_RUN_ID ?? completedAt,
          apiKey,
        });
        if (!res.ok) failFiler(`could not close ${fp}: ${res.reason}`);
        closed.push({ fingerprint: fp, ok: res.ok, id: issue.identifier });
      }
    } else {
      failFiler(`could not list open dogfood issues: ${open.reason}`);
    }
  } else {
    if (
      args.file &&
      !superseded &&
      process.env.DOGFOOD_REQUIRE_FILING === '1'
    ) {
      failFiler(
        'filing is required here but LINEAR_API_KEY is missing or remediation triggers are disabled'
      );
    }
    filingNotes.push(
      args.file
        ? superseded
          ? 'filing skipped: deploy moved during run'
          : 'filing skipped: no LINEAR_API_KEY or triggers disabled'
        : 'dry run (--no-file)'
    );
  }
  filingNotes.push(...ingestNotes);
  writeFileSync(
    path.join(outDir, 'findings.json'),
    `${JSON.stringify({ findings: findings.map(f => ({ mission: f.mission.id, ...f.check })), filed, closed, notes: filingNotes, filerFailures }, null, 2)}\n`
  );

  // 9. Summary (job summary + stdout).
  let metrics = [];
  if (apiKey) {
    const got = await linearDefectRows({ apiKey });
    if (got.ok) metrics = weeklyDefectMetrics(got.rows);
    else if (args.file)
      failFiler(`weekly agent-vs-Tim metric unavailable: ${got.reason}`);
  }
  const summary = renderSummary({
    binding,
    superseded,
    certification,
    findings,
    filed,
    closed,
    notes: filingNotes,
    metrics,
    evidence,
  });
  writeFileSync(path.join(outDir, 'summary.md'), summary);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  console.log(summary);
  process.exitCode = exitCodeFor({ findings: findings.length, filerFailures });
}

function renderSummary({
  binding,
  superseded,
  certification,
  findings,
  filed,
  closed,
  notes,
  metrics,
  evidence,
}) {
  const L = [];
  L.push(
    `### Production dogfood: ${certification.certified}/${certification.total} missions certified on ${binding.commitSha.slice(0, 10)} (${binding.deploymentId})`
  );
  if (superseded)
    L.push('', '> The deploy moved during this run; no mission was certified.');
  L.push('', '| Mission | Status | Blocker |', '| --- | --- | --- |');
  for (const m of certification.missions)
    L.push(
      `| ${m.missionId} | ${m.status} | ${(m.blocker ?? '').replace(/\|/g, '/')} |`
    );
  if (findings.length) {
    L.push('', `#### ${findings.length} defect(s) found`);
    for (const { check } of findings)
      L.push(
        `- [${check.severity}] ${check.summary}: ${check.url ?? check.target}. Expected ${check.expected}; actual ${check.actual}`
      );
  }
  if (filed.length)
    L.push(
      '',
      `Linear: ${filed.map(f => `${f.id ?? f.fingerprint} (${f.action ?? (f.ok ? 'ok' : f.reason)})`).join(', ')}`
    );
  if (closed.length) L.push(`Auto-closed: ${closed.map(c => c.id).join(', ')}`);
  if (notes.length) L.push('', ...notes.map(n => `- ${n}`));
  if (evidence.length)
    L.push('', 'Evidence gaps:', ...evidence.map(e => `- ${e}`));
  if (metrics.length) {
    L.push(
      '',
      '#### Defects by who found them first (per week)',
      '| Week | Agent-found | Tim-found | Agent share |',
      '| --- | --- | --- | --- |'
    );
    for (const r of metrics)
      L.push(
        `| ${r.week} | ${r.agentFound} | ${r.timFound} | ${r.agentShare ?? 'n/a'} |`
      );
  }
  return `${L.join('\n')}\n`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
