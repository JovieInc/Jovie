#!/usr/bin/env node
// @ts-nocheck Playwright page-context DOM globals are not in the Node scripts tsconfig.
// Privacy inventory crawler (compliance loop, stage 1).
//
// Loads every surface in canon/privacy/tracker-registry.json in a headless
// browser under four visitor scenarios and records what fires: cookies and
// storage keys (names only, never values), third-party request hosts, known
// tracker globals, input fields, pre-checked boxes, the "Do Not Sell or
// Share" link, the consent bar and any GPC confirmation. The output is a
// snapshot that privacy-rules.mjs evaluates and the evidence log stores.
//
// Scenarios. Production geo comes from Vercel's edge and cannot be spoofed,
// so each scenario re-asserts the edge's consent-region cookie
// (jv_cc_required) before page scripts run. This tests client gating, not geo
// detection (unit-tested in consent-regions), and keeps runs independent of
// where the crawler sits.
//   us-default  US visitor in a no-banner state (opt-out model, pixels on)
//   us-gpc      us-default plus Sec-GPC: 1 and navigator.globalPrivacyControl
//   eu          consent-required visitor (EU/UK; today also CA and four
//               other US states, see consent-regions.ts)
//   eu-accept   eu, then clicks Accept: the positive control proving the
//               pixel can fire, so "nothing fired" in eu is not vacuous.
//
// Usage: node scripts/compliance/privacy-inventory.mjs [--out file.json]
//        [--only <surface-id>,...] [--scenarios us-default,us-gpc]
// PLAYWRIGHT_MODULE may point at a playwright index.mjs outside this tree.

import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzePolicy } from './privacy-rules.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const REGISTRY_PATH = join(ROOT, 'canon/privacy/tracker-registry.json');
export const SCENARIOS = ['us-default', 'us-gpc', 'eu', 'eu-accept'];
export const SNAPSHOT_SCHEMA = 'jovie.privacy-inventory/v1';

const TRACKER_GLOBALS = [
  'fbq',
  'gtag',
  'dataLayer',
  'ttq',
  'snaptr',
  'twq',
  'pintrk',
  'lintrk',
  'Intercom',
  '$crisp',
  'posthog',
  'hj',
  'clarity',
  'mixpanel',
  'analytics',
  'FS',
  'LogRocket',
  'Sentry',
  '__SENTRY__',
  'statsig',
  'zE',
  'drift',
];
const DNS_LINK =
  /do not sell|your privacy choices|opt[- ]out of (the )?(sale|sharing)/i;
const GPC_CONFIRM = /global privacy control|\bGPC\b/i;

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

export function isFirstParty(host, firstParty) {
  return firstParty.some(d => host === d || host.endsWith(`.${d}`));
}

// Runs inside the page. Must stay self-contained (serialized by Playwright).
function pageProbe({ globals, dnsSource, gpcSource }) {
  const dns = new RegExp(dnsSource, 'i');
  const gpc = new RegExp(gpcSource, 'i');
  const visible = el => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return (
      r.width > 0 &&
      r.height > 0 &&
      s.visibility !== 'hidden' &&
      s.display !== 'none'
    );
  };
  const label = el =>
    (
      el.getAttribute('aria-label') ||
      el.getAttribute('name') ||
      el.id ||
      el.closest('label')?.textContent ||
      ''
    )
      .trim()
      .slice(0, 80);
  const kinds = new Set();
  for (const el of document.querySelectorAll(
    'input, textarea, [contenteditable="true"]'
  )) {
    if (!visible(el)) continue;
    const t = (el.getAttribute('type') || el.tagName).toLowerCase();
    if (
      [
        'hidden',
        'submit',
        'button',
        'checkbox',
        'radio',
        'image',
        'reset',
      ].includes(t)
    )
      continue;
    const ac = (el.getAttribute('autocomplete') || '').toLowerCase();
    if (t === 'password' || ac.includes('password')) kinds.add('password');
    else if (t === 'email' || ac.includes('email')) kinds.add('email');
    else if (t === 'tel' || ac.includes('tel')) kinds.add('tel');
    else if (t === 'search') kinds.add('search');
    else if (t === 'textarea' || t === 'div') kinds.add('freeform');
    else kinds.add('text');
  }
  for (const f of document.querySelectorAll('iframe')) {
    if (/js\.stripe\.com|checkout\.stripe\.com/.test(f.src) && visible(f))
      kinds.add('payment');
  }
  const prechecked = [];
  for (const el of document.querySelectorAll(
    'input[type=checkbox], [role=checkbox], [role=switch]'
  )) {
    const on = el.matches('input')
      ? el.checked
      : el.getAttribute('aria-checked') === 'true';
    if (on && visible(el) && !el.disabled) prechecked.push(label(el));
  }
  const links = [...document.querySelectorAll('a, button')];
  const dnsLink = links.find(a => dns.test(a.textContent || ''));
  const buttons = links.filter(visible).map(b => (b.textContent || '').trim());
  const acceptButtons = buttons.filter(t =>
    /^(accept|allow|agree|ok, got it)/i.test(t)
  );
  const rejectButtons = buttons.filter(t =>
    /^(reject|decline|deny|refuse|necessary only|only necessary)/i.test(t)
  );
  const bodyText = document.body?.innerText || '';
  const bannerVisible =
    acceptButtons.length > 0 && /cookie|consent|privacy/i.test(bodyText);
  return {
    title: document.title.slice(0, 120),
    input_kinds: [...kinds].sort(),
    prechecked,
    dns_link: dnsLink
      ? {
          text: dnsLink.textContent.trim().slice(0, 80),
          href: dnsLink.getAttribute('href'),
        }
      : null,
    consent_banner: {
      visible: bannerVisible,
      accept: acceptButtons.length,
      reject: rejectButtons.length,
    },
    gpc_confirmation: gpc.test(bodyText),
    globals: globals.filter(g => {
      try {
        return typeof window[g] !== 'undefined';
      } catch {
        return false;
      }
    }),
    local_storage_keys: Object.keys(localStorage).sort(),
    session_storage_keys: Object.keys(sessionStorage).sort(),
  };
}

async function newContext(browser, scenario) {
  const gpc = scenario === 'us-gpc';
  const context = await browser.newContext({
    locale: 'en-US',
    timezoneId: scenario.startsWith('eu')
      ? 'Europe/Berlin'
      : 'America/Los_Angeles',
    extraHTTPHeaders: gpc ? { 'Sec-GPC': '1' } : {},
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 JoviePrivacyInventory/1',
  });
  if (gpc) {
    await context.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', {
        get: () => true,
      });
    });
  }
  {
    // The edge sets jv_cc_required from real geo on every first-party
    // response (and route.fetch shares the context cookie jar, so stripping
    // Set-Cookie does not work). The banner and pixel gates read it from
    // document.cookie on mount, so re-assert the scenario's value before any
    // page script runs.
    const required = scenario.startsWith('eu') ? '1' : '0';
    await context.addInitScript(value => {
      document.cookie = `jv_cc_required=${value}; path=/`;
    }, required);
  }
  return context;
}

async function crawlOne(browser, surface, scenario, firstParty) {
  const context = await newContext(browser, scenario);
  const page = await context.newPage();
  const requests = [];
  page.on('request', req => {
    try {
      const u = new URL(req.url());
      if (!/^https?:$/.test(u.protocol)) return;
      requests.push({
        host: u.hostname,
        type: req.resourceType(),
        phase: 'load',
      });
    } catch {}
  });
  let status = null;
  let error = null;
  try {
    const res = await page.goto(surface.url, {
      waitUntil: 'load',
      timeout: 45_000,
    });
    status = res?.status() ?? null;
    // A 4xx or 5xx page is a failed crawl, not evidence: its few third-party
    // requests would make the privacy rules pass vacuously.
    if (status !== null && status >= 400) error = `HTTP ${status}`;
    await page
      .waitForLoadState('networkidle', { timeout: 15_000 })
      .catch(() => {});
    await page.waitForTimeout(2500);
  } catch (e) {
    error = String(e.message || e).slice(0, 200);
  }
  const probeArgs = {
    globals: TRACKER_GLOBALS,
    dnsSource: DNS_LINK.source,
    gpcSource: GPC_CONFIRM.source,
  };
  let probe = error
    ? null
    : await page
        .evaluate(pageProbe, probeArgs)
        .catch(e => ({ probe_error: String(e).slice(0, 200) }));
  // An unreadable page has no probe fields; rules must not judge it.
  if (probe?.probe_error) {
    error = `probe failed: ${probe.probe_error}`;
    probe = null;
  }
  let accepted = null;
  if (scenario === 'eu-accept' && probe?.consent_banner?.visible) {
    const before = requests.length;
    const btn = page
      .getByRole('button', { name: /^(accept|allow|agree)/i })
      .first();
    accepted = await btn.click({ timeout: 5000 }).then(
      () => true,
      () => false
    );
    await page
      .waitForLoadState('networkidle', { timeout: 10_000 })
      .catch(() => {});
    await page.waitForTimeout(2500);
    for (const r of requests.slice(before)) r.phase = 'after-accept';
    probe = await page.evaluate(pageProbe, probeArgs).catch(() => probe);
  }
  const cookies = (await context.cookies()).map(c => ({
    name: c.name,
    domain: c.domain.replace(/^\./, ''),
    third_party: !isFirstParty(c.domain.replace(/^\./, ''), firstParty),
  }));
  await context.close();
  const thirdParty = new Map();
  for (const r of requests) {
    if (isFirstParty(r.host, firstParty)) continue;
    const key = `${r.host}|${r.phase}`;
    const cur = thirdParty.get(key) ?? {
      host: r.host,
      phase: r.phase,
      count: 0,
      types: new Set(),
    };
    cur.count += 1;
    cur.types.add(r.type);
    thirdParty.set(key, cur);
  }
  return {
    surface: surface.id,
    product: surface.product,
    url: surface.url,
    scenario,
    status,
    error,
    final_url: page.url(),
    declared_inputs: surface.inputs ?? [],
    young_audience: Boolean(surface.young_audience),
    accepted,
    ...(probe ?? {}),
    cookies: cookies.sort((a, b) => a.name.localeCompare(b.name)),
    third_party_requests: [...thirdParty.values()]
      .map(v => ({ ...v, types: [...v.types].sort() }))
      .sort((a, b) => a.host.localeCompare(b.host)),
  };
}

async function fetchPolicyVersions(registry) {
  const out = {};
  for (const [id, url] of Object.entries(registry.policies ?? {})) {
    try {
      const res = await fetch(url, { redirect: 'follow' });
      const text = await res.text();
      out[id] = res.ok
        ? {
            url,
            status: res.status,
            sha256: sha256(text),
            bytes: text.length,
            analysis: analyzePolicy(text, registry),
          }
        : { url, status: res.status, error: `HTTP ${res.status}` };
    } catch (e) {
      out[id] = { url, error: String(e.message || e).slice(0, 160) };
    }
  }
  return out;
}

export async function crawl({
  registry,
  only,
  scenarios = SCENARIOS,
  chromium,
}) {
  const startedAt = new Date().toISOString();
  const surfaces = registry.surfaces.filter(s => !only || only.includes(s.id));
  const browser = await chromium.launch({ headless: true });
  const pages = [];
  try {
    for (const surface of surfaces) {
      for (const scenario of scenarios) {
        pages.push(
          await crawlOne(
            browser,
            surface,
            scenario,
            registry.first_party_domains
          )
        );
      }
    }
  } finally {
    await browser.close();
  }
  return {
    schema: SNAPSHOT_SCHEMA,
    run_id: randomUUID(),
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    registry_sha256: sha256(JSON.stringify(registry)),
    policy_versions: await fetchPolicyVersions(registry),
    pages,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
  const pw = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
  const chromium = pw.chromium ?? pw.default.chromium;
  const only = arg('--only')?.split(',');
  const scenarios = arg('--scenarios')?.split(',') ?? SCENARIOS;
  const unknownScenarios = scenarios.filter(name => !SCENARIOS.includes(name));
  if (unknownScenarios.length) {
    console.error(
      `Unknown scenario(s): ${unknownScenarios.join(', ')}. Valid: ${SCENARIOS.join(', ')}`
    );
    process.exit(2);
  }
  const snapshot = await crawl({ registry, only, scenarios, chromium });
  const out = arg('--out');
  const json = `${JSON.stringify(snapshot, null, 2)}\n`;
  if (out) writeFileSync(out, json);
  else process.stdout.write(json);
}
