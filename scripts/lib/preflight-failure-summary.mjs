import { stripVTControlCharacters } from 'node:util';

/** Preserve a failure's name and nearby cause within the existing display bound. */
export function failureSummaryLines(out) {
  const lines = stripVTControlCharacters(String(out))
    .split('\n')
    .filter(line => line.trim());
  const anchors = [
    /^\s*test at .+:\d+(?::\d+)?$/,
    /^\s*FAIL(?:\s|\|)/,
    /^\s*[\w-]+-guard:\s+\S+:\d+(?:,\d+)*\s+[\w-]+:/,
    /^\s*not ok \d+\b/,
    /^\s*[✖✗×]\s+(?!failing tests:)/,
    /^\s*(?:\w*Error(?:\s*\[[^\]]+\])?:|(?:.+(?::\d+(?::\d+)?|\(\d+,\d+\)):\s*)?error TS\d+:)/,
  ];
  for (const anchor of anchors) {
    const start = lines.findIndex(
      line => !/^\s*(?:[✓✔]|ok \d+\b|PASS\b)/.test(line) && anchor.test(line)
    );
    if (start !== -1) {
      return [
        '[first recognized failure context; output is bounded]',
        ...lines.slice(start, start + 13),
      ].map(line => line.slice(0, 220));
    }
  }
  return [
    '[no explicit failure header in retained output; showing tail]',
    ...lines.slice(-13),
  ].map(line => line.slice(0, 220));
}

const FAILURE_LINE = /(?:^|\b)(?:not ok\b|FAIL\b|location:|✖|×)/u;
const TEST_PATH = /((?:[\w.@/-]+\/)?[\w.@-]+\.test\.[cm]?[jt]sx?)/u;

/** Test files named by failure lines. The output tail is not a substitute:
 * preflight keeps only the last 200KB, which dropped the names and left
 * "8 failing tests" with nothing to fix. */
export function failureTestPaths(text) {
  const found = new Set();
  for (const line of String(text).split('\n')) {
    if (!FAILURE_LINE.test(line)) continue;
    const match = TEST_PATH.exec(line);
    if (!match) continue;
    const raw = match[1];
    const at = raw.lastIndexOf('scripts/');
    const app = raw.lastIndexOf('apps/');
    const rel = at >= 0 ? raw.slice(at) : app >= 0 ? raw.slice(app) : raw;
    found.add(rel);
  }
  return [...found];
}
