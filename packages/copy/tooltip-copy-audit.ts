#!/usr/bin/env tsx
/**
 * Tooltip copy scanner. Statically reads every tooltip string in UI source
 * and applies packages/copy/tooltip-copy.ts, ratcheted against
 * packages/copy/tooltip-copy.baseline.json (shrink-only, per file + rule).
 *
 *   tsx packages/copy/tooltip-copy-audit.ts check    fail on anything new
 *   tsx packages/copy/tooltip-copy-audit.ts update   rewrite baseline (shrinks only)
 *   tsx packages/copy/tooltip-copy-audit.ts list     print every finding
 *
 * Read: `content`/`label` on SimpleTooltip, Tooltip and TooltipShortcut, the
 * children of TooltipContent, and any `tooltip*` prop or object property.
 * Copy built at runtime is invisible here; shorten it with shortTooltipTitle.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import {
  checkTooltipCopy,
  TOOLTIP_COPY_LIMITS,
  type TooltipCopyRule,
} from './tooltip-copy';

export const BASELINE_PATH = 'packages/copy/tooltip-copy.baseline.json';
export const BASELINE_SCHEMA = 'jovie.tooltip-copy/v1';
export const CHECK_COMMAND = 'pnpm design:tooltip-copy:check';
export const UPDATE_COMMAND = 'pnpm design:tooltip-copy:update';
export const SCAN_ROOTS = [
  'apps/web/app',
  'apps/web/components',
  'apps/web/hooks',
  'apps/web/lib',
  'packages/ui',
] as const;

export type TooltipFindingRule =
  | TooltipCopyRule
  | 'rich-interactive'
  | 'rich-list-too-long';

export interface TooltipFinding {
  readonly path: string;
  readonly rule: TooltipFindingRule;
  readonly value: string;
  readonly line: number;
}

export interface Baseline {
  readonly schema: string;
  readonly totalFindings: number;
  readonly files: Record<string, Record<string, number>>;
}

// String form: jsdom replaces the global URL class in web unit tests.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  'coverage',
  'generated',
  'fixtures',
  'tests',
  '__tests__',
  'e2e',
  'storybook-static',
]);
// The internal component gallery demonstrates wrapping with long filler copy.
const SKIP_PATH = /^apps\/web\/app\/ui\//;
const SKIP_FILE = /\.(?:test|spec|stories)\.[cm]?[jt]sx?$|\.d\.ts$/;
const SOURCE_FILE = /\.tsx?$/;

/** Component → the props that carry its tooltip text. */
const TOOLTIP_COMPONENT_PROPS: Record<string, readonly string[]> = {
  SimpleTooltip: ['content'],
  Tooltip: ['label', 'content'],
  TooltipShortcut: ['label'],
};
/** Prop or property names that carry tooltip text on any owner. */
const TOOLTIP_PROP = /^tooltip(?:Label|Content|Text)?$/;
const INTERACTIVE_TAG = /^(?:a|button|input|select|textarea|Link|Button)$/;
const LIST_ITEM_TAG = /^li$/;

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name), out);
    } else if (SOURCE_FILE.test(entry.name) && !SKIP_FILE.test(entry.name)) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

interface Copy {
  readonly node: ts.Node;
  readonly text: string;
  readonly interactive: boolean;
  readonly listItems: number;
}

/**
 * Every static rendering of an expression. Branches yield one copy each;
 * interpolations and unknown values read as one word (`{x}`). Returns [] when
 * nothing static can be read.
 */
function readCopies(node: ts.Node | undefined): Copy[] {
  if (!node) return [];
  if (ts.isStringLiteralLike(node))
    return [{ node, text: node.text, interactive: false, listItems: 0 }];
  if (ts.isTemplateExpression(node)) {
    const text =
      node.head.text +
      node.templateSpans.map(span => `{x}${span.literal.text}`).join('');
    return [{ node, text, interactive: false, listItems: 0 }];
  }
  if (ts.isParenthesizedExpression(node)) return readCopies(node.expression);
  if (ts.isJsxExpression(node)) return readCopies(node.expression);
  if (ts.isConditionalExpression(node))
    return [...readCopies(node.whenTrue), ...readCopies(node.whenFalse)];
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
  )
    return readCopies(node.right);
  if (
    ts.isBinaryExpression(node) &&
    (node.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
      node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
  )
    return [...readCopies(node.left), ...readCopies(node.right)];
  if (ts.isJsxElement(node) || ts.isJsxFragment(node))
    return readJsx(node, node.children);
  if (ts.isJsxSelfClosingElement(node))
    return [
      {
        node,
        text: '',
        interactive: INTERACTIVE_TAG.test(node.tagName.getText()),
        listItems: 0,
      },
    ];
  return [];
}

function readJsx(node: ts.Node, children: ts.NodeArray<ts.JsxChild>): Copy[] {
  let copies: Copy[] = [
    {
      node,
      text: '',
      interactive:
        ts.isJsxElement(node) &&
        INTERACTIVE_TAG.test(node.openingElement.tagName.getText()),
      listItems:
        ts.isJsxElement(node) &&
        LIST_ITEM_TAG.test(node.openingElement.tagName.getText())
          ? 1
          : 0,
    },
  ];
  for (const child of children) {
    const alternatives = ts.isJsxText(child)
      ? [{ node: child, text: child.text, interactive: false, listItems: 0 }]
      : readCopies(child);
    if (!alternatives.length)
      alternatives.push({
        node: child,
        text: ts.isJsxExpression(child) && child.expression ? '{x}' : '',
        interactive: false,
        listItems: 0,
      });
    // Siblings render together; branches remain separate alternatives.
    copies = copies.flatMap(copy =>
      alternatives.map(alternative => ({
        node,
        text: `${copy.text} ${alternative.text}`,
        interactive: copy.interactive || alternative.interactive,
        listItems: copy.listItems + alternative.listItems,
      }))
    );
  }
  return copies.map(copy => ({
    ...copy,
    text: copy.text.replace(/\s+/g, ' ').trim(),
  }));
}

export function scanTooltipCopy(
  path: string,
  source: string
): TooltipFinding[] {
  const file = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const findings: TooltipFinding[] = [];
  const report = (copies: Copy[]) => {
    for (const copy of copies) {
      const rules: TooltipFindingRule[] = checkTooltipCopy(copy.text);
      if (copy.interactive) rules.push('rich-interactive');
      if (copy.listItems > TOOLTIP_COPY_LIMITS.listItems)
        rules.push('rich-list-too-long');
      const line =
        file.getLineAndCharacterOfPosition(copy.node.getStart(file)).line + 1;
      for (const rule of rules)
        findings.push({ path, rule, value: copy.text.slice(0, 90), line });
    }
  };
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const owned = TOOLTIP_COMPONENT_PROPS[node.tagName.getText(file)] ?? [];
      for (const attr of node.attributes.properties) {
        if (!ts.isJsxAttribute(attr)) continue;
        const name = attr.name.getText(file);
        if (owned.includes(name) || TOOLTIP_PROP.test(name))
          report(readCopies(attr.initializer));
      }
    }
    if (
      ts.isJsxElement(node) &&
      node.openingElement.tagName.getText(file) === 'TooltipContent'
    )
      report(readJsx(node, node.children));
    if (
      ts.isPropertyAssignment(node) &&
      (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) &&
      TOOLTIP_PROP.test(node.name.text)
    )
      report(readCopies(node.initializer));
    ts.forEachChild(node, visit);
  };
  visit(file);
  return findings;
}

export function toCounts(
  findings: readonly TooltipFinding[]
): Record<string, Record<string, number>> {
  const files: Record<string, Record<string, number>> = {};
  for (const finding of findings) {
    const rules = (files[finding.path] ??= {});
    rules[finding.rule] = (rules[finding.rule] ?? 0) + 1;
  }
  return files;
}

export function compareToBaseline(
  files: Record<string, Record<string, number>>,
  baseline: Pick<Baseline, 'files'>
): { regressions: string[]; shrinks: string[] } {
  const regressions: string[] = [];
  const shrinks: string[] = [];
  for (const [path, rules] of Object.entries(files)) {
    for (const [rule, count] of Object.entries(rules)) {
      const allowed = baseline.files[path]?.[rule] ?? 0;
      if (count > allowed)
        regressions.push(
          `${path}: ${rule} (${allowed} allowed, ${count} found)`
        );
    }
  }
  for (const [path, rules] of Object.entries(baseline.files)) {
    for (const [rule, allowed] of Object.entries(rules)) {
      const count = files[path]?.[rule] ?? 0;
      if (count < allowed)
        shrinks.push(`${path}: ${rule} ${allowed} -> ${count}`);
    }
  }
  return { regressions, shrinks };
}

export function scanAll(root = ROOT): TooltipFinding[] {
  const findings: TooltipFinding[] = [];
  for (const scanRoot of SCAN_ROOTS) {
    for (const file of walk(join(root, scanRoot))) {
      const rel = relative(root, file).split('\\').join('/');
      if (SKIP_PATH.test(rel)) continue;
      const source = readFileSync(file, 'utf8');
      if (!/tooltip/i.test(source)) continue;
      findings.push(...scanTooltipCopy(rel, source));
    }
  }
  return findings;
}

export function readBaseline(root = ROOT): Baseline {
  const path = join(root, BASELINE_PATH);
  if (!existsSync(path))
    return { schema: BASELINE_SCHEMA, totalFindings: 0, files: {} };
  return JSON.parse(readFileSync(path, 'utf8'));
}

function main(argv: string[]): number {
  const [command = 'check'] = argv;
  const findings = scanAll();
  const files = toCounts(findings);
  if (command === 'list') {
    for (const f of findings)
      console.log(`${f.path}:${f.line} [${f.rule}] ${f.value}`);
    console.log(`tooltip-copy: ${findings.length} finding(s)`);
    return 0;
  }
  const { regressions, shrinks } = compareToBaseline(files, readBaseline());
  if (command === 'update') {
    if (regressions.length) {
      console.error(
        `tooltip-copy: refusing to grow the baseline:\n${regressions.join('\n')}`
      );
      return 1;
    }
    const baseline: Baseline = {
      schema: BASELINE_SCHEMA,
      totalFindings: findings.length,
      files: Object.fromEntries(Object.entries(files).sort()),
    };
    writeFileSync(
      join(ROOT, BASELINE_PATH),
      `${JSON.stringify(baseline, null, 2)}\n`
    );
    console.log(
      `tooltip-copy: baseline written, ${findings.length} grandfathered`
    );
    return 0;
  }
  for (const regression of regressions)
    console.error(`tooltip-copy: new ${regression}`);
  if (regressions.length) {
    console.error(
      `tooltip-copy: a tooltip is a title of ${TOOLTIP_COPY_LIMITS.titleWords} words or fewer plus at most one sentence of ${TOOLTIP_COPY_LIMITS.sentenceWords} words or fewer, with no claims or how-it-works copy. Run \`tsx packages/copy/tooltip-copy-audit.ts list\` and see apps/web/components/atoms/Tooltip.README.md.`
    );
    return 1;
  }
  // Shrink-only: a fixed tooltip must leave the baseline in the same change.
  if (shrinks.length) {
    console.error(
      `tooltip-copy: ${shrinks.length} grandfathered finding(s) fixed; run ${UPDATE_COMMAND} to lock the shrink:\n${shrinks.join('\n')}`
    );
    return 1;
  }
  console.log(`tooltip-copy: clean (${findings.length} grandfathered)`);
  return 0;
}

if (process.argv[1]?.endsWith('tooltip-copy-audit.ts')) {
  process.exit(main(process.argv.slice(2)));
}
