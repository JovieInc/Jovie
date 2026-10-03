/**
 * `pnpm --filter web seo:certify` (JOV-7249).
 *
 * Sweeps every public route in MARKETING_ROUTE_MANIFEST against rendered HTML
 * and ratchets failures against lib/seo/seo-certify-baseline.json.
 *
 * HTML source, cheapest first and never live production:
 * - default: the prerendered build output (`.next/server/app/<path>.html`),
 *   the same `.next` CI's "Build (public routes)" job already produces;
 * - `--base-url http://localhost:3000`: fetch a locally running `next start`
 *   for routes that are not prerendered.
 *
 *   tsx scripts/seo-certify.ts [--build-dir .next] [--base-url URL]
 *     [--sha SHA] [--run-ref REF] [--out report.json]
 *     [--write-baseline | --seed-baseline] [--post]
 *
 * Exit 1 on a regression (a failing route+check not in the baseline) or on a
 * stale baseline entry (debt that is fixed must be removed: --write-baseline).
 * `--post` sends each packet to the evidence ingest route through the
 * marketing certification producer (needs CRON_SECRET and --ingest-url).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  certifySweep,
  compareToBaseline,
  failureMap,
  SEO_CERTIFY_BASELINE_SCHEMA,
  type SeoCertifyBaseline,
  type SeoSweepPage,
  type SeoSweepTarget,
  shrinkBaseline,
  sweepTargets,
} from '@/lib/seo/seo-certify-sweep';
import { postCertificationPacket } from './marketing-certification-producer';

const WEB_ROOT = join(dirname(new URL(import.meta.url).pathname), '..');

export const SEO_CERTIFY_BASELINE_PATH = join(
  WEB_ROOT,
  'lib',
  'seo',
  'seo-certify-baseline.json'
);

export function loadSeoCertifyBaseline(
  path = SEO_CERTIFY_BASELINE_PATH
): SeoCertifyBaseline {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as SeoCertifyBaseline;
  if (raw.schema !== SEO_CERTIFY_BASELINE_SCHEMA) {
    throw new Error(`${path}: expected schema ${SEO_CERTIFY_BASELINE_SCHEMA}`);
  }
  return raw;
}

/** `.next/server/app` file stem for a pathname (`/` is `index`). */
export function buildOutputStem(pathname: string): string {
  return pathname === '/' ? 'index' : pathname.replace(/^\//, '');
}

export function readBuildPage(
  appDir: string,
  target: SeoSweepTarget
): SeoSweepPage {
  const stem = join(appDir, buildOutputStem(target.pathname));
  const htmlPath = `${stem}.html`;
  const source = relative(WEB_ROOT, htmlPath);
  if (!existsSync(htmlPath)) return { target, html: null, status: 0, source };
  let status = 200;
  if (existsSync(`${stem}.meta`)) {
    const meta = JSON.parse(readFileSync(`${stem}.meta`, 'utf8')) as {
      status?: number;
    };
    status = meta.status ?? 200;
  }
  return { target, html: readFileSync(htmlPath, 'utf8'), status, source };
}

async function fetchPage(
  baseUrl: string,
  target: SeoSweepTarget
): Promise<SeoSweepPage> {
  const url = new URL(target.pathname, baseUrl).toString();
  try {
    const response = await fetch(url, { redirect: 'manual' });
    return {
      target,
      html: await response.text(),
      status: response.status,
      source: url,
    };
  } catch {
    return { target, html: null, status: 0, source: url };
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      'build-dir': { type: 'string', default: '.next' },
      'base-url': { type: 'string' },
      sha: { type: 'string' },
      'run-ref': { type: 'string', default: 'local' },
      out: { type: 'string' },
      'write-baseline': { type: 'boolean', default: false },
      'seed-baseline': { type: 'boolean', default: false },
      post: { type: 'boolean', default: false },
      'ingest-url': { type: 'string' },
    },
  });
  const sha = values.sha ?? null;
  if (sha !== null && !/^[0-9a-f]{40}$/u.test(sha))
    throw new Error('--sha must be a full 40-hex commit');

  const appDir = resolve(
    WEB_ROOT,
    values['build-dir'] ?? '.next',
    'server',
    'app'
  );
  const baseUrl = values['base-url'];
  if (!baseUrl && !existsSync(appDir)) {
    throw new Error(
      `No build output at ${appDir}. Run \`pnpm --filter web build\` or pass --base-url.`
    );
  }
  const targets = sweepTargets();
  const pages = await Promise.all(
    targets.map(target =>
      baseUrl ? fetchPage(baseUrl, target) : readBuildPage(appDir, target)
    )
  );
  const readSiteFile = async (pathname: string): Promise<string | null> => {
    if (baseUrl) {
      const response = await fetch(new URL(pathname, baseUrl)).catch(
        () => null
      );
      return response?.ok ? response.text() : null;
    }
    const bodyPath = join(appDir, `${pathname.replace('/', '')}.body`);
    return existsSync(bodyPath) ? readFileSync(bodyPath, 'utf8') : null;
  };
  const results = certifySweep({
    pages,
    sourceSha: sha,
    runRef: values['run-ref'] ?? 'local',
    now: new Date(),
    llmsTxt: await readSiteFile('/llms.txt'),
    robotsTxt: await readSiteFile('/robots.txt'),
  });

  for (const result of results) {
    const failed = result.certification.checks.filter(
      check => check.status === 'failed'
    );
    console.log(
      `[seo:certify] ${result.target.pathname} ${failed.length === 0 ? 'pass' : `fail ${failed.map(check => `${check.dimension}:${check.id}`).join(' ')}`}`
    );
  }

  const current = failureMap(results);
  if (values['seed-baseline']) {
    writeBaseline({ schema: SEO_CERTIFY_BASELINE_SCHEMA, failures: current });
    console.log(`[seo:certify] seeded ${SEO_CERTIFY_BASELINE_PATH}`);
    return;
  }
  const baseline = loadSeoCertifyBaseline();
  const comparison = compareToBaseline(
    current,
    baseline,
    results.map(result => result.target.pathname)
  );

  if (values.out) {
    writeFileSync(
      values.out,
      `${JSON.stringify(
        {
          sweptAt: new Date().toISOString(),
          sha,
          comparison,
          routes: results.map(result => ({
            pathname: result.target.pathname,
            family: result.target.family,
            inSitemap: result.target.inSitemap,
            passed: result.certification.passed,
            checks: result.certification.checks,
            packet: result.packet,
            stageReceipt: result.stageReceipt,
            artifact: result.artifact,
          })),
        },
        null,
        2
      )}\n`
    );
  }

  if (values.post) {
    const secret = process.env.CRON_SECRET;
    const ingestUrl = values['ingest-url'];
    if (!secret || !ingestUrl)
      throw new Error('--post needs CRON_SECRET and --ingest-url');
    for (const result of results) {
      const posted = await postCertificationPacket(
        ingestUrl,
        secret,
        result.packet
      );
      console.log(
        `[seo:certify] post ${result.target.pathname} -> ${posted.summary}`
      );
    }
  }

  if (values['write-baseline']) {
    writeBaseline(shrinkBaseline(baseline, current));
    console.log(
      `[seo:certify] baseline shrunk by ${comparison.resolved.length} entr${comparison.resolved.length === 1 ? 'y' : 'ies'}`
    );
  } else if (comparison.resolved.length > 0) {
    console.error(
      `[seo:certify] fixed debt still in the baseline (run with --write-baseline):\n  ${comparison.resolved.join('\n  ')}`
    );
  }
  if (comparison.regressions.length > 0) {
    console.error(
      `[seo:certify] new failures (not in baseline):\n  ${comparison.regressions.join('\n  ')}`
    );
  }
  const summary = `${results.length} routes, ${Object.keys(current).length} with failures, ${comparison.regressions.length} regressions`;
  console.log(`[seo:certify] ${summary}`);
  if (
    comparison.regressions.length > 0 ||
    (comparison.resolved.length > 0 && !values['write-baseline'])
  ) {
    process.exit(1);
  }
}

function writeBaseline(baseline: unknown) {
  writeFileSync(
    SEO_CERTIFY_BASELINE_PATH,
    `${JSON.stringify(baseline, null, 2)}\n`
  );
  // Keep the checked-in file in the repo's formatter shape.
  execFileSync(
    'pnpm',
    ['exec', 'biome', 'format', '--write', SEO_CERTIFY_BASELINE_PATH],
    { cwd: WEB_ROOT, stdio: 'ignore' }
  );
}

if (process.argv[1]?.endsWith('seo-certify.ts')) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
