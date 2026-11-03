#!/usr/bin/env node
/**
 * Re-measures the published jov.ie/tim vs linktr.ee/timwhite claims and flags any
 * that stopped being true (apps/web/content/comparative-claims.ts).
 *
 *   node scripts/benchmarks/vs-linktree.mjs [--runs 3] [--out receipt.json]
 *
 * Exit 0: every claim holds. Exit 1: at least one claim is flagged (CLAIM-FLAG
 * lines name it). Exit 2: the measurement itself failed, which flags nothing.
 *
 * Load policy: a handful of public page loads per run, alternating between the
 * two pages, Lighthouse mobile emulation for both. Nothing is scraped.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { loadavg, tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  allowsPinchZoom,
  COMPARATIVE_BENCHMARK,
  COMPARATIVE_CLAIMS,
  evaluateComparativeClaim,
  hasMusicMarkup,
  median,
  thirdPartyHosts,
} from '../../apps/web/content/comparative-claims.ts';

const LIGHTHOUSE = 'lighthouse@13.4.1';
const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 ? process.argv[index + 1] : fallback;
}

function lighthouseOnce(url, dir, index) {
  const out = join(dir, `lh-${index}.json`);
  const result = spawnSync(
    'npm',
    [
      'exec',
      '--yes',
      `--package=${LIGHTHOUSE}`,
      '--',
      'lighthouse',
      url,
      '--quiet',
      '--output=json',
      `--output-path=${out}`,
      '--only-categories=performance',
      '--form-factor=mobile',
      '--chrome-flags=--headless=new --no-sandbox --disable-gpu',
    ],
    { encoding: 'utf8', timeout: 180_000, cwd: dir }
  );
  if (result.status !== 0) {
    throw new Error(
      `lighthouse failed for ${url}: ${(result.stderr || '').slice(0, 300)}`
    );
  }
  const lhr = JSON.parse(readFileSync(out, 'utf8'));
  const audits = lhr.audits;
  const requests = audits['network-requests'].details.items;
  return {
    lcp: audits['largest-contentful-paint'].numericValue,
    fcp: audits['first-contentful-paint'].numericValue,
    tbt: audits['total-blocking-time'].numericValue,
    bytes: audits['total-byte-weight'].numericValue,
    js: requests
      .filter(item => item.resourceType === 'Script')
      .reduce((sum, item) => sum + item.transferSize, 0),
    score: Math.round(lhr.categories.performance.score * 100),
    thirdParty: thirdPartyHosts(
      url,
      requests.map(item => item.url)
    ).length,
  };
}

async function pageFacts(url) {
  const response = await fetch(url, {
    headers: { 'user-agent': MOBILE_UA },
    redirect: 'follow',
  });
  const html = await response.text();
  const viewport =
    /<meta[^>]+name=["']viewport["'][^>]*>/iu.exec(html)?.[0] ?? '';
  const content = /content=["']([^"']*)["']/iu.exec(viewport)?.[1] ?? null;
  const blocks = [
    ...html.matchAll(
      /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/giu
    ),
  ].map(match => match[1]);
  return {
    zoom: allowsPinchZoom(content) ? 1 : 0,
    music: hasMusicMarkup(blocks) ? 1 : 0,
  };
}

async function main() {
  const runs = Number(arg('runs', '3'));
  const outPath = arg('out', null);
  const dir = mkdtempSync(join(tmpdir(), 'vs-linktree-'));
  const samples = { jovie: [], competitor: [] };
  try {
    for (let i = 0; i < runs; i++) {
      // Alternate so any host or network drift hits both pages equally.
      samples.jovie.push(
        lighthouseOnce(COMPARATIVE_BENCHMARK.jovieUrl, dir, `j${i}`)
      );
      samples.competitor.push(
        lighthouseOnce(COMPARATIVE_BENCHMARK.competitorUrl, dir, `c${i}`)
      );
    }
    const facts = {
      jovie: await pageFacts(COMPARATIVE_BENCHMARK.jovieUrl),
      competitor: await pageFacts(COMPARATIVE_BENCHMARK.competitorUrl),
    };
    const pick = (side, key) =>
      median(samples[side].map(sample => sample[key]));
    const live = {
      'lcp-ms': {
        jovie: pick('jovie', 'lcp'),
        competitor: pick('competitor', 'lcp'),
      },
      'fcp-ms': {
        jovie: pick('jovie', 'fcp'),
        competitor: pick('competitor', 'fcp'),
      },
      'tbt-ms': {
        jovie: pick('jovie', 'tbt'),
        competitor: pick('competitor', 'tbt'),
      },
      'total-bytes': {
        jovie: pick('jovie', 'bytes'),
        competitor: pick('competitor', 'bytes'),
      },
      'js-bytes': {
        jovie: pick('jovie', 'js'),
        competitor: pick('competitor', 'js'),
      },
      'performance-score': {
        jovie: pick('jovie', 'score'),
        competitor: pick('competitor', 'score'),
      },
      'third-party-hosts': {
        jovie: pick('jovie', 'thirdParty'),
        competitor: pick('competitor', 'thirdParty'),
      },
      'pinch-zoom': {
        jovie: facts.jovie.zoom,
        competitor: facts.competitor.zoom,
      },
      'music-markup': {
        jovie: facts.jovie.music,
        competitor: facts.competitor.music,
      },
    };
    const evaluations = COMPARATIVE_CLAIMS.map(claim => ({
      ...evaluateComparativeClaim(claim, live[claim.metric]),
      metric: claim.metric,
      live: live[claim.metric],
    }));
    const receipt = {
      schema: 'jovie-vs-linktree-receipt/v1',
      measuredAt: new Date().toISOString(),
      runs,
      hostLoad1m: Number(loadavg()[0].toFixed(1)),
      method: COMPARATIVE_BENCHMARK.method,
      evaluations,
    };
    if (outPath) writeFileSync(outPath, JSON.stringify(receipt, null, 2));
    for (const evaluation of evaluations) {
      const line = `${evaluation.holds ? 'ok  ' : 'CLAIM-FLAG'} ${evaluation.claimId} jovie=${evaluation.live.jovie} linktree=${evaluation.live.competitor} ${evaluation.reason}`;
      console.log(line);
    }
    process.exitCode = evaluations.every(item => item.holds) ? 0 : 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(`measurement-failed: ${error.message}`);
  process.exitCode = 2;
});
