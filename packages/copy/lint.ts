import {
  COPY_BUDGETS,
  COPY_RULES,
  type CopyCategory,
  type CopyRegister,
  type CopyRule,
  type CopySeverity,
} from './rules';

export interface CopyFinding {
  readonly rule: string;
  readonly category: CopyCategory;
  readonly severity: CopySeverity;
  readonly match: string;
  readonly index: number;
  readonly message: string;
}

export interface CopyLintResult {
  /** false when any block finding exists. */
  readonly ok: boolean;
  readonly register: CopyRegister;
  readonly findings: readonly CopyFinding[];
  readonly blocking: readonly CopyFinding[];
}

export interface CopyLintOptions {
  readonly register: CopyRegister;
  /** Rule ids to skip, e.g. quoted third-party text. Floor rules cannot be skipped. */
  readonly allow?: readonly string[];
  /** Text is a heading: enables heading-only rules. */
  readonly headline?: boolean;
}

// Rules nobody may waive: the "impossible to ship" floor.
const UNWAIVABLE: ReadonlySet<CopyCategory> = new Set([
  'harm',
  'legal',
  'platform',
  'privacy',
  'leak',
  'negativity',
]);

function appliesTo(rule: CopyRule, register: CopyRegister): boolean {
  return rule.registers === 'all' || rule.registers.includes(register);
}

// Curly quotes would otherwise dodge every contraction pattern.
function normalize(text: string): string {
  return text.replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"');
}

/**
 * Deterministic copy lint. Pure, synchronous, no network: safe on every
 * runtime send path. This is the only gate volume-tier text gets.
 */
export function lintCopy(
  text: string,
  options: CopyLintOptions
): CopyLintResult {
  const { register } = options;
  const allow = new Set(options.allow ?? []);
  const source = normalize(text);
  const findings: CopyFinding[] = [];

  for (const rule of COPY_RULES) {
    if (!appliesTo(rule, register) || (rule.headlineOnly && !options.headline))
      continue;
    if (allow.has(rule.id) && !UNWAIVABLE.has(rule.category)) continue;
    const global = new RegExp(
      rule.pattern.source,
      rule.pattern.flags.includes('g')
        ? rule.pattern.flags
        : `${rule.pattern.flags}g`
    );
    for (const match of source.matchAll(global)) {
      findings.push({
        rule: rule.id,
        category: rule.category,
        severity: rule.warnIn?.includes(register) ? 'warn' : rule.severity,
        match: match[0],
        index: match.index ?? 0,
        message: rule.message,
      });
    }
  }

  const budget = COPY_BUDGETS[register];
  for (const sentence of source.split(/(?<=[.!?])\s+|\n+/)) {
    const count = sentence.split(/\s+/).filter(Boolean).length;
    if (count > budget.maxSentenceWords) {
      findings.push({
        rule: 'long-sentence',
        category: 'clarity',
        severity: 'warn',
        match: sentence.slice(0, 80),
        index: source.indexOf(sentence),
        message: `${count} words; this register reads best under ${budget.maxSentenceWords}.`,
      });
    }
  }
  const bangs = (source.match(/!/g) ?? []).length;
  if (bangs > budget.maxExclamations) {
    findings.push({
      rule: 'exclamation-budget',
      category: 'format',
      severity: 'warn',
      match: '!',
      index: source.indexOf('!'),
      message: `${bangs} exclamation marks; budget is ${budget.maxExclamations}.`,
    });
  }

  const blocking = findings.filter(finding => finding.severity === 'block');
  return { ok: blocking.length === 0, register, findings, blocking };
}
