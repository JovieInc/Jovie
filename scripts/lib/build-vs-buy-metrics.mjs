/**
 * Build-vs-buy measurements (canon/BUILD_VS_BUY.md, "Measure it").
 * Pure: the CLI hands in manifests and file texts, this returns the snapshot.
 */
import { domainOf, isMaintainedSource, reinventions } from './build-vs-buy.mjs';

const SECTIONS = ['dependencies', 'devDependencies', 'optionalDependencies'];

export function countDependencies(manifests) {
  const unique = new Set();
  const prod = new Set();
  const dev = new Set();
  for (const { json } of manifests) {
    for (const section of SECTIONS)
      for (const [name, range] of Object.entries(json[section] ?? {})) {
        if (String(range).startsWith('workspace:')) continue;
        unique.add(name);
        (section === 'devDependencies' ? dev : prod).add(name);
      }
  }
  return {
    manifests: manifests.length,
    unique: unique.size,
    prod: prod.size,
    dev: dev.size,
  };
}

/**
 * @param {{ manifests: {path:string,json:object}[], files: {path:string,text:string}[], config: object, now?: number }} input
 */
export function computeMetrics({ manifests, files, config, now = Date.now() }) {
  const lines = new Map();
  const standing = {};
  let waivers = 0;
  let total = 0;
  for (const file of files) {
    if (!isMaintainedSource(file.path, config)) continue;
    const count = file.text.split('\n').length;
    total += count;
    const domain = domainOf(file.path);
    lines.set(domain, (lines.get(domain) ?? 0) + count);
    if (file.text.includes(config.waiverMarker))
      waivers += file.text.split(config.waiverMarker).length - 1;
    const pseudo = {
      filename: file.path,
      patch: file.text
        .split('\n')
        .map(line => `+${line}`)
        .join('\n'),
    };
    for (const hit of reinventions([pseudo], config))
      standing[hit.rule] = (standing[hit.rule] ?? 0) + 1;
  }
  const byDomain = Object.fromEntries(
    [...lines].sort((a, b) => b[1] - a[1]).slice(0, 40)
  );
  return {
    schema: 'jovie-build-vs-buy-metrics/v1',
    generatedAt: new Date(now).toISOString(),
    dependencies: countDependencies(manifests),
    maintainedLines: { total, domains: lines.size, byDomain },
    reinventions: {
      standing,
      standingTotal: Object.values(standing).reduce((a, b) => a + b, 0),
      waivers,
    },
    thresholds: {
      newModuleLines: config.newModuleLineThreshold,
    },
    // PR-time catches are annotations on the PR Fleet Rules check; the committed
    // series of this file (daily) is the trend. See canon/BUILD_VS_BUY.md.
    catches: { source: 'pr-fleet-rules annotations', ledger: null },
  };
}

/** The small block Summer reads inside the lanes status feed `slo` object. */
export function summarizeMetrics(metrics) {
  return {
    dependencies: metrics.dependencies.unique,
    maintainedLines: metrics.maintainedLines.total,
    topDomains: Object.entries(metrics.maintainedLines.byDomain)
      .slice(0, 5)
      .map(([domain, count]) => ({ domain, lines: count })),
    standingReinventions: metrics.reinventions.standingTotal,
    waivers: metrics.reinventions.waivers,
    generatedAt: metrics.generatedAt,
  };
}
