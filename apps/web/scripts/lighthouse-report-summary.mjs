#!/usr/bin/env node
// Prints why each Lighthouse page scored what it did, straight into the CI
// log. The HTML reports go to an artifact that agents often cannot download,
// so a budget miss otherwise names the metric but not its cause.
//
// Usage: node scripts/lighthouse-report-summary.mjs <lhci output dir>...
import { existsSync, readFileSync } from 'node:fs';
import { basename, isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const MAX_ROWS = 5;
const MAX_TEXT = 120;

function clip(value) {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text;
}

function stripOrigin(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return clip(url);
  }
}

function numeric(report, auditId) {
  const value = report.audits?.[auditId]?.numericValue;
  return typeof value === 'number' ? value : null;
}

function formatMs(value) {
  return value === null ? 'n/a' : `${Math.round(value)} ms`;
}

function formatBytes(value) {
  return typeof value === 'number' ? `${(value / 1024).toFixed(1)} KiB` : 'n/a';
}

function tableItems(report, auditId) {
  const items = report.audits?.[auditId]?.details?.items;
  return Array.isArray(items) ? items : [];
}

export function summarizeReport(report) {
  const lines = [];
  const cls = numeric(report, 'cumulative-layout-shift');
  lines.push(
    `Page ${stripOrigin(report.finalDisplayedUrl ?? report.requestedUrl)}`
  );
  lines.push(
    `  FCP ${formatMs(numeric(report, 'first-contentful-paint'))}, LCP ${formatMs(
      numeric(report, 'largest-contentful-paint')
    )}, TBT ${formatMs(numeric(report, 'total-blocking-time'))}, CLS ${
      cls === null ? 'n/a' : cls.toFixed(3)
    }, server response ${formatMs(numeric(report, 'server-response-time'))}`
  );

  const document = tableItems(report, 'network-requests').find(
    item => item.resourceType === 'Document'
  );
  if (document) {
    lines.push(
      `  Document ${formatBytes(document.transferSize)} transferred, ${formatBytes(
        document.resourceSize
      )} uncompressed`
    );
  }

  // lcp-breakdown-insight's details are a list: a table of the LCP's
  // subparts, then the LCP element itself.
  const lcpParts = report.audits?.['lcp-breakdown-insight']?.details?.items;
  if (Array.isArray(lcpParts)) {
    const element = lcpParts.find(part => part?.type === 'node');
    if (element) {
      lines.push(
        `  LCP element: ${clip(element.snippet ?? element.selector ?? 'unknown element')}`
      );
    }
    const subparts = lcpParts.find(part => part?.type === 'table')?.items;
    if (Array.isArray(subparts) && subparts.length > 0) {
      lines.push(
        `  LCP breakdown: ${subparts
          .map(
            part =>
              `${clip(part.label ?? part.subpart)} ${formatMs(
                typeof part.duration === 'number' ? part.duration : null
              )}`
          )
          .join(', ')}`
      );
    }
  }

  const scripts = tableItems(report, 'bootup-time')
    .slice()
    .sort((a, b) => (b.scripting ?? 0) - (a.scripting ?? 0))
    .slice(0, MAX_ROWS);
  if (scripts.length > 0) {
    lines.push('  Main-thread script time:');
    for (const item of scripts) {
      lines.push(
        `    ${stripOrigin(item.url)} ${formatMs(item.scripting ?? null)} running, ${formatMs(
          item.scriptParseCompile ?? null
        )} parsing`
      );
    }
  }

  // Name what is inside the dominant chunk. script-treemap-data carries a
  // per-module tree only when the build ships source maps; without them the
  // report can say the chunk is heavy but not which modules made it so.
  const treemap = report.audits?.['script-treemap-data']?.details?.nodes;
  const top = scripts[0];
  if (treemap && top) {
    const chunkUrl = stripOrigin(top.url);
    const root = treemap.find(
      node => stripOrigin(node.name ?? '') === chunkUrl
    );
    const leaves = [];
    const walk = (node, depth) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node.children) && node.children.length > 0) {
        for (const child of node.children) walk(child, depth + 1);
        return;
      }
      leaves.push({
        name: stripOrigin(node.name ?? 'unknown module'),
        bytes: typeof node.resourceBytes === 'number' ? node.resourceBytes : 0,
        depth,
      });
    };
    if (root) walk(root, 0);
    const withDepth = leaves.filter(leaf => leaf.depth > 0);
    if (withDepth.length > 0) {
      const modules = withDepth.sort((a, b) => b.bytes - a.bytes).slice(0, 3);
      lines.push('  Dominant chunk by module (largest first):');
      for (const module of modules) {
        lines.push(`    ${formatBytes(module.bytes)} ${module.name}`);
      }
    } else {
      lines.push(
        '  Dominant chunk attribution: report has no source-map depth; enable source maps for the Lighthouse build to name the modules.'
      );
    }
  }

  const blocking = tableItems(report, 'render-blocking-insight')
    .slice()
    .sort((a, b) => (b.wastedMs ?? 0) - (a.wastedMs ?? 0))
    .slice(0, MAX_ROWS);
  if (blocking.length > 0) {
    lines.push('  Render-blocking requests:');
    for (const item of blocking) {
      lines.push(
        `    ${stripOrigin(item.url)} ${formatBytes(item.totalBytes)} ${formatMs(
          item.wastedMs ?? null
        )}`
      );
    }
  }

  const shifts = tableItems(report, 'layout-shifts')
    .slice()
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, MAX_ROWS);
  if (shifts.length > 0) {
    lines.push('  Layout shifts:');
    for (const item of shifts) {
      const node = item.node ?? {};
      const causes = (item.subItems?.items ?? [])
        .map(subItem => subItem.cause)
        .filter(Boolean)
        .map(clip);
      lines.push(
        `    ${(item.score ?? 0).toFixed(3)} ${clip(node.selector ?? node.snippet ?? 'unknown element')}${
          causes.length > 0 ? ` (${causes.join('; ')})` : ''
        }`
      );
      // The selector alone is often a chain of utility classes; the element's
      // opening tag and box say which part of the page it is.
      const rect = node.boundingRect;
      const box = rect
        ? ` at ${Math.round(rect.left)},${Math.round(rect.top)} ${Math.round(rect.width)}x${Math.round(rect.height)}`
        : '';
      if (node.snippet || box) {
        lines.push(`      ${clip(node.snippet ?? '')}${box}`);
      }
    }
  }
  return lines;
}

// lhci's filesystem target writes manifest.json with one entry per run and
// marks the median run of each URL as representative.
export function summarizeDirectory(directory) {
  const manifestPath = join(directory, 'manifest.json');
  if (!existsSync(manifestPath)) {
    return [`No Lighthouse manifest in ${directory}.`];
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const representative = manifest.filter(entry => entry.isRepresentativeRun);
  const lines = [`Lighthouse summary for ${directory} (median run per page)`];
  for (const entry of representative) {
    const reportPath =
      isAbsolute(entry.jsonPath) || existsSync(entry.jsonPath)
        ? entry.jsonPath
        : join(directory, basename(entry.jsonPath));
    if (!existsSync(reportPath)) {
      lines.push(`Page ${stripOrigin(entry.url)}: report file missing.`);
      continue;
    }
    lines.push(
      ...summarizeReport(JSON.parse(readFileSync(reportPath, 'utf8')))
    );
  }
  return lines;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const directories = process.argv.slice(2);
  for (const directory of directories) {
    // A summary is evidence, not a gate: an unreadable report is printed as
    // such so it never turns a passing Lighthouse run red.
    try {
      console.log(summarizeDirectory(directory).join('\n'));
    } catch (error) {
      console.log(`Could not summarize ${directory}: ${clip(error?.message)}`);
    }
  }
}
