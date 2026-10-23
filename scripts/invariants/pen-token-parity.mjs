#!/usr/bin/env node
/**
 * Fail when Pen color variables diverge from design.tokens.json.
 *
 * The live .pen file is not in the repo. CI compares the committed export at
 * docs/pen-stills/pen-variables.json. Dark is the only mode that is compared.
 * Pre-existing finding ids in the baseline stay green; a new id fails.
 *
 *   node scripts/invariants/pen-token-parity.mjs
 *   node scripts/invariants/pen-token-parity.mjs \
 *     --pen "/path/to/file.pen" \
 *     --write-export docs/pen-stills/pen-variables.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXPORT_SCHEMA = 'pen-variables-export/v1';
export const ALIAS_SCHEMA = 'pen-token-aliases/v1';
export const BASELINE_SCHEMA = 'pen-token-parity-baseline/v1';
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

/** @param {string} input */
export function parseColor(input) {
  if (typeof input !== 'string') return null;
  const text = input.trim();
  const hex = text.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    let body = hex[1];
    if (body.length === 3 || body.length === 4) {
      body = [...body].map(char => char + char).join('');
    }
    if (body.length !== 6 && body.length !== 8) return null;
    const r = Number.parseInt(body.slice(0, 2), 16);
    const g = Number.parseInt(body.slice(2, 4), 16);
    const b = Number.parseInt(body.slice(4, 6), 16);
    const a =
      body.length === 8 ? Number.parseInt(body.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a: Math.round(a * 100) / 100 };
  }
  const rgb = text.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i
  );
  if (!rgb) return null;
  return {
    r: Math.round(Number(rgb[1])),
    g: Math.round(Number(rgb[2])),
    b: Math.round(Number(rgb[3])),
    a: Math.round((rgb[4] === undefined ? 1 : Number(rgb[4])) * 100) / 100,
  };
}

/** @param {unknown} left @param {unknown} right */
export function colorsEqual(left, right) {
  const a = parseColor(String(left));
  const b = parseColor(String(right));
  return Boolean(
    a && b && a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a
  );
}

/**
 * Last theme entry whose axes are satisfied wins. A bare value applies to
 * every mode. Evaluation passes { mode: 'dark' } explicitly.
 * @param {unknown} value
 * @param {Record<string, string>} theme
 */
export function resolveThemedValue(value, theme) {
  if (!Array.isArray(value)) return value;
  let winner;
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const axes = entry.theme ?? {};
    const satisfied = Object.entries(axes).every(
      ([axis, axisValue]) => theme[axis] === axisValue
    );
    if (satisfied) winner = entry.value;
  }
  return winner;
}

/** @param {any} doc */
export function variableEntries(doc) {
  if (doc?.schema === EXPORT_SCHEMA && Array.isArray(doc.variables)) {
    return doc.variables.map(variable => ({
      name: variable.name,
      type: variable.type,
      modes: {
        dark: variable.modes?.dark ?? null,
        light: variable.modes?.light ?? null,
      },
    }));
  }
  const source = doc?.variables;
  if (!source || typeof source !== 'object') {
    throw new Error('Pen document has no variables object');
  }
  const rows = Array.isArray(source)
    ? source
    : Object.entries(source).map(([name, value]) => ({
        name,
        ...(value ?? {}),
      }));
  return rows.map(variable => ({
    name: variable.name,
    type: variable.type,
    modes: {
      dark: resolveThemedValue(variable.value, { mode: 'dark' }) ?? null,
      light: resolveThemedValue(variable.value, { mode: 'light' }) ?? null,
    },
  }));
}

/** @param {any} doc */
export function toExportDocument(doc, source = {}) {
  return {
    schema: EXPORT_SCHEMA,
    coverage: 'full',
    primaryMode: 'dark',
    source,
    variables: variableEntries(doc).map(variable => ({
      name: variable.name,
      ...(variable.type ? { type: variable.type } : {}),
      modes: variable.modes,
    })),
  };
}

/** @param {any} tokens @param {string} alias */
export function readTokenColor(tokens, alias) {
  const dot = alias.indexOf('.');
  if (dot < 0) return null;
  const node = tokens[alias.slice(0, dot)]?.[alias.slice(dot + 1)];
  if (!node || node.$type !== 'color') return null;
  return node.$value ?? null;
}

function isColorVariable(variable) {
  if (variable.type === 'color') return true;
  if (variable.type && variable.type !== 'color') return false;
  return parseColor(String(variable.modes.dark ?? '')) !== null;
}

/**
 * @param {{doc: any, tokens: any, aliases: Record<string, string>}} input
 */
export function comparePenTokens({ doc, tokens, aliases }) {
  /** @type {Array<{id: string, detail: string}>} */
  const findings = [];
  if (
    doc?.schema === EXPORT_SCHEMA &&
    doc.primaryMode &&
    doc.primaryMode !== 'dark'
  ) {
    findings.push({
      id: 'primary-mode',
      detail: 'Pen variable export primaryMode must be dark',
    });
  }
  if ((doc?.schema === EXPORT_SCHEMA ? doc.coverage : 'full') !== 'full') {
    findings.push({
      id: 'incomplete-export',
      detail: 'Pen variable export is a seed, not the live .pen file',
    });
  }
  for (const variable of variableEntries(doc)) {
    if (!isColorVariable(variable)) continue;
    const alias = aliases[variable.name];
    if (!alias) {
      findings.push({
        id: `unmapped:${variable.name}`,
        detail: `${variable.name} has no design token alias`,
      });
      continue;
    }
    const token = readTokenColor(tokens, alias);
    const dark = variable.modes.dark;
    if (token == null || dark == null) {
      findings.push({
        id: `missing:${variable.name}`,
        detail: `${variable.name} → ${alias} is missing a dark color`,
      });
      continue;
    }
    if (!colorsEqual(dark, token)) {
      findings.push({
        id: `value:${variable.name}:dark`,
        detail: `${variable.name} dark ${dark} != ${alias} ${token}`,
      });
    }
  }
  return findings;
}

/**
 * @param {Array<{id: string, detail: string}>} findings
 * @param {{allowed?: string[]}} baseline
 */
export function ratchet(findings, baseline) {
  const allowed = new Set(baseline.allowed ?? []);
  const fresh = findings.filter(finding => !allowed.has(finding.id));
  const stale = [...allowed].filter(
    id => !findings.some(finding => finding.id === id)
  );
  return { ok: fresh.length === 0, fresh, stale };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function parseArgs(argv) {
  /** @type {Record<string, string | boolean>} */
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--'))
      args[token.slice(2)] = true;
    else {
      args[token.slice(2)] = next;
      i += 1;
    }
  }
  return args;
}

function loadPen(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    throw new Error(`Cannot read Pen file ${path}: ${error.message}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `${path} is not a JSON Pen document. Export variables from the .pen file on the design machine; do not commit the .pen.`
    );
  }
}

export function checkPaths(root = REPO_ROOT) {
  const doc = readJson(join(root, 'docs/pen-stills/pen-variables.json'));
  const aliasDoc = readJson(
    join(root, 'docs/pen-stills/pen-variable-aliases.json')
  );
  const baseline = readJson(
    join(root, 'docs/pen-stills/pen-variable-baseline.json')
  );
  const tokens = readJson(join(root, 'design.tokens.json'));
  if (aliasDoc.schema !== ALIAS_SCHEMA) {
    throw new Error(`aliases schema must be ${ALIAS_SCHEMA}`);
  }
  if (baseline.schema !== BASELINE_SCHEMA) {
    throw new Error(`baseline schema must be ${BASELINE_SCHEMA}`);
  }
  const findings = comparePenTokens({
    doc,
    tokens,
    aliases: aliasDoc.aliases ?? {},
  });
  return { findings, ...ratchet(findings, baseline) };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(
      'usage: pen-token-parity.mjs [--pen file.pen --write-export out.json] [--write-baseline out.json]\n'
    );
    return;
  }
  if (args.pen && args['write-export']) {
    const doc = loadPen(String(args.pen));
    const out = toExportDocument(doc, {
      name: String(args.pen),
      inRepo: false,
      sha256: null,
    });
    writeFileSync(
      resolve(String(args['write-export'])),
      `${JSON.stringify(out, null, 2)}\n`
    );
    process.stdout.write(
      `wrote ${args['write-export']} (${out.variables.length} variables)\n`
    );
    return;
  }
  const result = checkPaths(REPO_ROOT);
  if (args['write-baseline']) {
    const baseline = {
      schema: BASELINE_SCHEMA,
      allowed: result.findings.map(finding => finding.id),
    };
    writeFileSync(
      resolve(String(args['write-baseline'])),
      `${JSON.stringify(baseline, null, 2)}\n`
    );
    process.stdout.write(`wrote baseline ${args['write-baseline']}\n`);
    return;
  }
  for (const stale of result.stale) {
    process.stdout.write(`warning: baseline id not seen: ${stale}\n`);
  }
  if (!result.ok) {
    for (const finding of result.fresh) {
      process.stderr.write(`${finding.id}: ${finding.detail}\n`);
    }
    process.exit(1);
  }
  process.stdout.write(
    `pen token parity ok (${result.findings.length} baselined finding${result.findings.length === 1 ? '' : 's'})\n`
  );
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) main();
