#!/usr/bin/env node
/**
 * Frontend-skill machine checks (JOV-7759).
 *
 * The deterministic subset of Tim's frontend-skill taste contract
 * (~/.codex/skills/frontend-skill): rules a machine can decide from source,
 * so the lane loop iterates on them before a human sees the design. Taste
 * judgment stays with the visual judge and the founder.
 *
 * Diff mode (default) checks only lines added since `--diff-base`, so
 * existing debt does not block unrelated work. `--files` checks whole files.
 * A line may opt out with `frontend-skill-allow FS-00N: <reason>`.
 *
 *   node scripts/design-frontend-skill-check.mjs --diff-base origin/main
 *   node scripts/design-frontend-skill-check.mjs --files a.tsx b.css
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Product UI sources; tests, stories and fixtures are evidence, not UI. */
const UI_FILE =
  /^(?:apps\/web\/(?:app|components|styles)\/|packages\/ui\/).*\.(?:tsx|jsx|css)$/;
const NOT_UI = /(?:\.test\.|\.spec\.|\.stories\.|\/__tests__\/|\/fixtures?\/)/;
const COMMENT = /^\s*(?:\/\/|\/\*|\*|\{\s*\/\*)/;
const ALLOW = /frontend-skill-allow (FS-\d{3}):\s*\S/g;
/** Lines either side of a hit that a multi-line `cn()` call can span. */
const NEARBY = 4;
/** A trailing `// ...` comment (not a URL's `://`). */
const TRAILING_COMMENT = /(^|[^:])\/\/.*$/;

/**
 * @typedef {{ id: string, severity: 'error' | 'warning', rule: string, test: (line: string, nearby: string) => boolean }} Rule
 * @typedef {{ id: string, severity: string, rule: string, file: string, line: number, text: string }} Finding
 */

/** @type {Rule[]} */
export const RULES = [
  {
    id: 'FS-001',
    severity: 'error',
    rule: 'Product code must not introduce serif fonts',
    test: line =>
      /\bfont-serif\b/.test(line) ||
      /font-family:[^;]*(?<!sans-)\bserif\b/.test(line),
  },
  {
    id: 'FS-002',
    severity: 'error',
    rule: 'No emoji or Unicode checkmarks in UI; use a text label or the canonical icon',
    test: line => /[✓✔☑]|\p{Emoji_Presentation}/u.test(line),
  },
  {
    id: 'FS-003',
    severity: 'error',
    rule: 'Hover may change paint only: no translate, scale, offset, size, padding or border-width',
    test: line =>
      /\b(?:group-)?hover:-?(?:translate-|scale-|m[trblxy]?-|p[trblxy]?-|w-|h-|top-|left-|right-|bottom-|inset-|border-(?:[xytrbl]-)?\d)/.test(
        line
      ),
  },
  {
    id: 'FS-004',
    severity: 'error',
    rule: 'Transition only the properties that change (no transition-all)',
    test: line =>
      /\btransition-all\b/.test(line) ||
      /transition(?:-property)?:\s*all\b/.test(line),
  },
  {
    id: 'FS-005',
    severity: 'error',
    rule: 'Text below 12px is off the type scale',
    test: line =>
      /\btext-\[(?:\d|1[01])(?:\.\d+)?px\]/.test(line) ||
      /font-size:\s*(?:\d|1[01])(?:\.\d+)?px/.test(line),
  },
  {
    id: 'FS-006',
    severity: 'error',
    rule: 'No hover-only affordance: a control revealed on hover must also reveal on focus',
    // The focus reveal may sit on another line of the same class list.
    test: (line, nearby) =>
      /\bopacity-0\b/.test(line) &&
      /\b(?:group-)?hover:opacity-100\b/.test(line) &&
      !/\b(?:group-)?focus(?:-visible|-within)?:opacity-100\b/.test(
        `${line}\n${nearby}`
      ),
  },
  {
    id: 'FS-007',
    severity: 'error',
    rule: 'Never hardcode a color when a semantic token exists',
    test: line =>
      /\b(?:bg|text|border|fill|stroke|ring|outline|from|via|to|shadow)-\[#[0-9a-fA-F]{3,8}\]/.test(
        line
      ) ||
      (!/^\s*--[\w-]+\s*:/.test(line) &&
        /\b(?:color|background(?:-color)?)\s*[:=]\s*['"]?#[0-9a-fA-F]{3,8}\b/.test(
          line
        )),
  },
  {
    id: 'FS-008',
    severity: 'warning',
    rule: 'Native <select> cannot certify a selection design; prefer the canonical select owner',
    test: line => /<select[\s>]/.test(line),
  },
];

/**
 * @param {string} path
 */
export function isUiFile(path) {
  return UI_FILE.test(path) && !NOT_UI.test(path);
}

/**
 * Findings for one line of one file.
 * @param {string} file
 * @param {number} lineNumber
 * @param {string} text
 * @param {string} [nearby] surrounding source lines, for multi-line class lists
 * @returns {Finding[]}
 */
export function checkLine(file, lineNumber, text, nearby = '') {
  if (COMMENT.test(text)) return [];
  const allowed = new Set([...text.matchAll(ALLOW)].map(match => match[1]));
  const code = text.replace(TRAILING_COMMENT, '$1');
  return RULES.filter(
    rule => !allowed.has(rule.id) && rule.test(code, nearby)
  ).map(rule => ({
    id: rule.id,
    severity: rule.severity,
    rule: rule.rule,
    file,
    line: lineNumber,
    text: text.trim().slice(0, 200),
  }));
}

/**
 * Added lines per file from `git diff --unified=0` output.
 * @param {string} diff
 * @returns {Map<string, Array<[number, string]>>}
 */
export function addedLines(diff) {
  /** @type {Map<string, Array<[number, string]>>} */
  const files = new Map();
  /** @type {string | null} */
  let file = null;
  let next = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) {
      file = line.startsWith('+++ b/') ? line.slice(6) : null;
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      next = Number(hunk[1]);
      continue;
    }
    if (file && line.startsWith('+')) {
      const rows = files.get(file) ?? [];
      rows.push([next, line.slice(1)]);
      files.set(file, rows);
      next += 1;
    }
  }
  return files;
}

/**
 * @param {Map<string, Array<[number, string]>>} lines
 * @param {(file: string) => string[] | null} [source] the whole file's lines,
 *   so an added line is read with its unchanged neighbours
 * @returns {Finding[]}
 */
export function checkLines(lines, source = () => null) {
  /** @type {Finding[]} */
  const findings = [];
  for (const [file, rows] of lines) {
    if (!isUiFile(file)) continue;
    const whole = source(file);
    const at = new Map(rows);
    /** @param {number} n */
    const lineAt = n => (whole ? whole[n - 1] : at.get(n)) ?? '';
    for (const [lineNumber, text] of rows) {
      const nearby = [];
      for (let n = lineNumber - NEARBY; n <= lineNumber + NEARBY; n += 1)
        if (n !== lineNumber) nearby.push(lineAt(n));
      findings.push(...checkLine(file, lineNumber, text, nearby.join('\n')));
    }
  }
  return findings;
}

/**
 * @param {string} file
 * @returns {string[] | null}
 */
function readSource(file) {
  try {
    return readFileSync(file, 'utf8').split('\n');
  } catch {
    return null;
  }
}

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
  /** @type {{ diffBase: string, files: string[], json: boolean }} */
  const args = { diffBase: 'origin/main', files: [], json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--diff-base') args.diffBase = argv[++index];
    else if (arg === '--json') args.json = true;
    else if (arg === '--files') args.files = argv.slice(index + 1);
    if (arg === '--files') break;
  }
  return args;
}

/**
 * @param {string[]} argv
 * @returns {number}
 */
export function main(argv) {
  const args = parseArgs(argv);
  /** @type {Map<string, Array<[number, string]>>} */
  let lines;
  if (args.files.length > 0) {
    lines = new Map(
      args.files.map(file => [
        file,
        readFileSync(file, 'utf8')
          .split('\n')
          .map(
            (text, index) => /** @type {[number, string]} */ ([index + 1, text])
          ),
      ])
    );
  } else {
    const diff = execFileSync(
      'git',
      [
        'diff',
        '--unified=0',
        '--no-color',
        '--no-ext-diff',
        `${args.diffBase}...HEAD`,
        '--',
        'apps/web',
        'packages/ui',
      ],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
    );
    lines = addedLines(diff);
  }
  const findings = checkLines(lines, readSource);
  const errors = findings.filter(finding => finding.severity === 'error');
  if (args.json) {
    process.stdout.write(
      `${JSON.stringify({ schema: 'jovie.frontend-skill-check/v1', findings }, null, 2)}\n`
    );
  } else {
    for (const finding of findings) {
      process.stdout.write(
        `${finding.severity === 'error' ? 'ERROR' : 'WARN '} ${finding.id} ${finding.file}:${finding.line} ${finding.rule}\n    ${finding.text}\n`
      );
    }
    process.stdout.write(
      `[frontend-skill] ${errors.length} error(s), ${findings.length - errors.length} warning(s) in added UI lines\n`
    );
  }
  return errors.length > 0 ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
