#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
/** Source-bound native DS projection and portable Swift checks (JOV-5331). */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  scanSwiftSource,
  tierOf,
} from '../../../scripts/invariants/native-spacing-scale.mjs';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const MANIFEST = 'apps/ios/scripts/native-design-system.manifest.json';
export const START = '  // BEGIN GENERATED NATIVE COLORS';
export const END = '  // END GENERATED NATIVE COLORS';

export function semanticDeclarations(css) {
  const blocks = [
    ...css
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .matchAll(/:root\.dark\s*\{([^}]+)\}/g),
  ].filter(match => match[1].includes('--noir-ion-canvas:'));
  if (blocks.length !== 1)
    throw new Error('Expected exactly one product dark semantic emitter');
  const values = new Map();
  for (const match of blocks[0][1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    if (values.has(match[1]))
      throw new Error(`Duplicate semantic mapping: ${match[1]}`);
    values.set(match[1], match[2].trim());
  }
  return values;
}

export function resolveSemantic(name, values, seen = new Set()) {
  if (seen.has(name)) throw new Error(`Cyclic semantic mapping: ${name}`);
  const value = values.get(name);
  if (!value) throw new Error(`Missing semantic mapping: ${name}`);
  const alias = value.match(/^var\((--[\w-]+)\)$/);
  return alias
    ? resolveSemantic(alias[1], values, new Set([...seen, name]))
    : value;
}

export function swiftColor(value) {
  if (/^#[\da-f]{6}$/i.test(value))
    return `Color(hex: 0x${value.slice(1).toUpperCase()})`;
  const rgba = value.match(
    /^rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*(0?\.\d+|1)\s*\)$/
  );
  if (!rgba || rgba.slice(1, 4).some(v => Number(v) > 255))
    throw new Error(`Unsupported canonical color: ${value}`);
  const hex = rgba
    .slice(1, 4)
    .map(v => Number(v).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
  return `Color(hex: 0x${hex}).opacity(${Number(rgba[4])})`;
}

export function projectedColors(manifest, palette, css) {
  if (
    manifest.schema !== 'jovie-native-design-system/v1' ||
    palette.schema !== 'ziawi-color-sot-v1'
  ) {
    throw new Error('Unknown native/palette contract');
  }
  const declarations = semanticDeclarations(css);
  const names = new Set();
  const paths = new Set();
  const lines = [];
  for (const binding of manifest.bindings) {
    if (!/^[a-zA-Z]\w*$/.test(binding.name) || names.has(binding.name))
      throw new Error(`Duplicate/invalid native mapping: ${binding.name}`);
    names.add(binding.name);
    if (Boolean(binding.json) === Boolean(binding.css))
      throw new Error(`Ambiguous native mapping: ${binding.name}`);
    let value;
    let source;
    if (binding.json) {
      source = binding.json.join('.');
      if (paths.has(source))
        throw new Error(`Duplicate palette role: ${source}`);
      paths.add(source);
      value = binding.json.reduce((object, key) => object?.[key], palette);
      if (typeof value !== 'string')
        throw new Error(`Missing palette role: ${source}`);
    } else {
      source = binding.css;
      value = resolveSemantic(binding.css, declarations);
    }
    lines.push(
      `  /// Source: ${source}`,
      `  static let ${binding.name} = ${swiftColor(value)}`
    );
  }
  for (const [group, roles, prefix] of [
    [palette.elevations, palette.elevations.roles, 'elevations.dark'],
    [palette.accents, palette.accents.roles, 'accents.hex'],
  ]) {
    if (group.count !== roles.length || new Set(roles).size !== roles.length)
      throw new Error('Invalid canonical role inventory');
    for (const role of roles)
      if (!paths.has(`${prefix}.${role}`))
        throw new Error(`Unmapped canonical role: ${prefix}.${role}`);
  }
  return `${START}\n${lines.join('\n')}\n${END}`;
}

export function replaceProjection(source, projection) {
  const starts = source.split(START).length - 1;
  const ends = source.split(END).length - 1;
  if (starts !== 1 || ends !== 1 || source.indexOf(START) > source.indexOf(END))
    throw new Error('Missing/duplicate generated color boundary');
  return (
    source.slice(0, source.indexOf(START)) +
    projection +
    source.slice(source.indexOf(END) + END.length)
  );
}

/** Mask Swift comments/strings without changing offsets; nested block comments included. */
export function maskSwift(source) {
  let result = '';
  let index = 0;
  while (index < source.length) {
    let end = index;
    if (source.startsWith('//', index)) {
      end = source.indexOf('\n', index);
      if (end < 0) end = source.length;
    } else if (source.startsWith('/*', index)) {
      end = index + 2;
      let depth = 1;
      while (end < source.length && depth) {
        if (source.startsWith('/*', end)) {
          depth++;
          end += 2;
        } else if (source.startsWith('*/', end)) {
          depth--;
          end += 2;
        } else end++;
      }
    } else if (
      source[index] === '"' ||
      (/#/.test(source[index]) && source[index + 1] === '"')
    ) {
      const raw = source[index] === '#';
      const quote = raw ? index + 1 : index;
      const triple = source.startsWith('"""', quote);
      const delimiter = (triple ? '"""' : '"') + (raw ? '#' : '');
      end = quote + (triple ? 3 : 1);
      while (end < source.length) {
        if (!raw && source[end] === '\\') {
          end += 2;
          continue;
        }
        if (source.startsWith(delimiter, end)) {
          end += delimiter.length;
          break;
        }
        end++;
      }
    }
    if (end > index) {
      result += source.slice(index, end).replace(/[^\n]/g, ' ');
      index = end;
    } else result += source[index++];
  }
  return result;
}

/** Flag literals even behind a Swift typealias; Color.clear and native semantic roles remain legal. */
export function rawColors(source) {
  const code = maskSwift(source);
  const aliases = new Set(['Color', 'UIColor', 'NSColor', 'CGColor']);
  const declarations = [...code.matchAll(/\btypealias\s+(\w+)\s*=\s*(\w+)/g)];
  for (let pass = 0; pass <= declarations.length; pass++) {
    for (const match of declarations)
      if (aliases.has(match[2])) aliases.add(match[1]);
  }
  const type = [...aliases].join('|');
  const raw =
    'white|black|red|blue|green|orange|pink|purple|gray|yellow|cyan|mint|brown|magenta|systemBlue|systemRed';
  const patterns = [
    new RegExp(`\\b(?:${type})\\s*\\.\\s*(?:${raw})\\b`, 'g'),
    new RegExp(`\\b(?:${type})\\s*\\(`, 'g'),
    new RegExp(
      `\\.(?:foregroundStyle|foregroundColor|background|tint|fill|stroke)\\s*\\(\\s*\\.\\s*(?:${raw})\\b`,
      'g'
    ),
    new RegExp(
      `:\\s*(?:${type})\\s*=\\s*\\.\\s*(?:(?:${raw})\\b|init\\s*\\(\\s*(?:hex|red|white|hue)\\s*:)`,
      'g'
    ),
  ];
  return patterns.flatMap(pattern =>
    [...code.matchAll(pattern)].map(match => ({
      offset: match.index,
      line: code.slice(0, match.index).split('\n').length,
      expression: source
        .slice(match.index, match.index + match[0].length)
        .replace(/\s+/g, ' '),
    }))
  );
}

/** Exemptions are exact statements inside a named owner, with a bounded count. */
export function exemptPaint(source, path, exceptions) {
  const code = maskSwift(source);
  const counts = new Map();
  const issues = [];
  const rows = rawColors(source).filter(row => {
    for (const exception of exceptions.filter(item => item.path === path)) {
      if (!exception.reason || exception.reason.length < 20)
        throw new Error('Paint exception requires a concrete reason');
      const owner = new RegExp(`\\benum\\s+${exception.owner}\\s*\\{`).exec(
        code
      );
      if (!owner) continue;
      let end = owner.index + owner[0].length;
      let depth = 1;
      while (end < code.length && depth) {
        if (code[end] === '{') depth++;
        if (code[end] === '}') depth--;
        end++;
      }
      const line = source.split('\n')[row.line - 1].trim();
      if (
        row.offset >= owner.index &&
        row.offset < end &&
        line === exception.statement
      ) {
        const count = (counts.get(exception) || 0) + 1;
        counts.set(exception, count);
        if (count > exception.maximum)
          issues.push(`Paint exception grew: ${exception.owner}`);
        return false;
      }
    }
    return true;
  });
  for (const exception of exceptions.filter(item => item.path === path)) {
    if ((counts.get(exception) || 0) !== exception.maximum)
      issues.push(`Stale paint exception: ${exception.owner}`);
  }
  return { rows, issues };
}

export function measureNativePaint(root, manifest) {
  const debt = {};
  const issues = [];
  const tokens = geometryTokens(
    readFileSync(resolve(root, manifest.theme), 'utf8')
  );
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        walk(file);
        continue;
      }
      if (!entry.name.endsWith('.swift')) continue;
      const path = relative(root, file).split('\\').join('/');
      if (path.endsWith('/UITestHarnessViews.swift')) continue;
      let source = readFileSync(file, 'utf8');
      if (path === manifest.theme) {
        const start = source.indexOf(START),
          end = source.indexOf(END);
        if (start < 0 || end < start)
          throw new Error('Missing generated paint boundary');
        source =
          source.slice(0, start) +
          source.slice(start, end + END.length).replace(/[^\n]/g, ' ') +
          source.slice(end + END.length);
      }
      const result = exemptPaint(source, path, manifest.exceptions);
      issues.push(...result.issues);
      issues.push(
        ...scanConcentricSwift(source, tokens).map(issue => `${path}: ${issue}`)
      );
      for (const row of result.rows) {
        const statement = source.split('\n')[row.line - 1].trim();
        const key = `${path} :: ${statement}`;
        debt[key] = (debt[key] || 0) + 1;
      }
    }
  }
  walk(resolve(root, 'apps/ios/Jovie'));
  return { debt, issues };
}

export function paintRatchet(current, baseline) {
  const issues = [];
  for (const [key, count] of Object.entries(current)) {
    if (count > (baseline[key] || 0))
      issues.push(`New feature-local raw paint: ${key}`);
  }
  for (const [key, count] of Object.entries(baseline)) {
    if ((current[key] || 0) < count)
      issues.push(`Lower removed raw-paint debt: ${key}`);
  }
  return issues;
}

/** A changed baseline cannot approve its own growth. Existing Git base owns the ceiling. */
export function trustedPaintCeiling(root, manifest) {
  const git = args =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  const base = git(['merge-base', 'HEAD', 'origin/main']).trim();
  const existing = git([
    'ls-tree',
    '--name-only',
    base,
    '--',
    manifest.paintDebt,
  ]).trim();
  if (existing)
    return JSON.parse(git(['show', `${base}:${manifest.paintDebt}`]))
      .identities;
  // First introduction: independently measure the immutable base, never the proposed floor.
  const rows = git([
    'ls-tree',
    '-r',
    '--format=%(objectname) %(path)',
    base,
    '--',
    'apps/ios/Jovie',
  ])
    .trim()
    .split('\n')
    .filter(
      row =>
        row.endsWith('.swift') &&
        !row.endsWith('/UITestHarnessViews.swift') &&
        !row.endsWith('/DesignSystem/JovieTheme.swift')
    );
  const hashes = rows.map(row => row.split(' ')[0]);
  const batch = execFileSync('git', ['cat-file', '--batch'], {
    cwd: root,
    input: hashes.join('\n') + '\n',
    maxBuffer: 8 * 1024 * 1024,
  });
  const debt = {};
  let offset = 0;
  for (const row of rows) {
    const end = batch.indexOf(10, offset);
    const header = batch.subarray(offset, end).toString();
    const size = Number(header.split(' ')[2]);
    if (!Number.isFinite(size))
      throw new Error('Native baseline Git blob unavailable');
    const source = batch.subarray(end + 1, end + 1 + size).toString();
    offset = end + size + 2;
    const path = row.slice(row.indexOf(' ') + 1);
    for (const hit of rawColors(source)) {
      const key = `${path} :: ${source.split('\n')[hit.line - 1].trim()}`;
      debt[key] = (debt[key] || 0) + 1;
    }
  }
  return debt;
}

/** Geometry is explicit: unrelated shapes and pill/circle families have no nested corner equation. */
export function checkConcentric({ shape, outer, inner, inset, tokens }) {
  if (shape === 'pill' || shape === 'circle' || shape === 'unrelated')
    return [];
  if (shape !== 'rounded') return ['Unknown geometry family'];
  const values = [outer, inner, inset].map(name => tokens[name]);
  if (values.some(value => !Number.isFinite(value)))
    return ['Nested geometry must resolve named tokens'];
  if (values.some(value => value < 0) || values[0] !== values[1] + values[2])
    return ['outer must equal inner + inset'];
  return [];
}

export function geometryTokens(theme) {
  const tokens = {};
  for (const owner of ['JovieSpacing', 'JovieRadius']) {
    const body = theme.match(new RegExp(`enum ${owner} \\{([^}]+)\\}`))?.[1];
    if (!body) throw new Error(`Missing native geometry owner: ${owner}`);
    for (const match of body.matchAll(
      /static let (\w+): CGFloat = (\d+(?:\.\d+)?)/g
    ))
      tokens[`${owner}.${match[1]}`] = Number(match[2]);
  }
  return tokens;
}

/** Direct nested modifier anatomy only; no equation is inferred between unrelated siblings. */
export function scanConcentricSwift(source, tokens) {
  const code = maskSwift(source);
  const atom = '([\\w.]+)';
  const pattern = new RegExp(
    `\\.clipShape\\(\\s*RoundedRectangle\\(\\s*cornerRadius:\\s*${atom}(?:,\\s*style:\\s*\\.continuous)?\\s*\\)\\s*\\)\\s*\\.padding\\(\\s*${atom}\\s*\\)\\s*\\.background\\([^{;]*?RoundedRectangle\\(\\s*cornerRadius:\\s*${atom}`,
    'g'
  );
  return [...code.matchAll(pattern)].flatMap(match => {
    const [, inner, inset, outer] = match;
    if (/\.pill$/.test(inner) || /\.pill$/.test(outer)) return [];
    return checkConcentric({ shape: 'rounded', inner, inset, outer, tokens });
  });
}

export function nativeSpacing(source) {
  return scanSwiftSource(maskSwift(source)).filter(
    value => tierOf(value) === 'conservative'
  );
}

export function contrastRatio(foreground, background, opacity = 1) {
  const rgb = value =>
    value
      .slice(1)
      .match(/../g)
      .map(channel => Number.parseInt(channel, 16) / 255);
  const bg = rgb(background);
  const fg = rgb(foreground).map(
    (value, index) => value * opacity + bg[index] * (1 - opacity)
  );
  const luminance = channels =>
    channels.reduce(
      (sum, channel, index) =>
        sum +
        (channel <= 0.04045
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4) *
          [0.2126, 0.7152, 0.0722][index],
      0
    );
  const [low, high] = [luminance(fg), luminance(bg)].sort((a, b) => a - b);
  return (high + 0.05) / (low + 0.05);
}

export function checkNativeDesign(root = ROOT, { write = false } = {}) {
  const manifest = JSON.parse(readFileSync(resolve(root, MANIFEST), 'utf8'));
  const palette = JSON.parse(
    readFileSync(resolve(root, manifest.palette), 'utf8')
  );
  const css = readFileSync(resolve(root, manifest.semantics), 'utf8');
  const themePath = resolve(root, manifest.theme);
  const theme = readFileSync(themePath, 'utf8');
  const projection = projectedColors(manifest, palette, css);
  const expected = replaceProjection(theme, projection);
  if (write) writeFileSync(themePath, expected);
  const issues = [];
  if (!write && expected !== theme)
    issues.push(
      'Native palette/semantics differ from canonical projection; run native-design-system.mjs --write'
    );
  for (const [name, target] of Object.entries(manifest.aliases)) {
    const declaration = `static let ${name} = ${target}`;
    if (
      maskSwift(theme)
        .split('\n')
        .filter(line => line.trim() === declaration).length !== 1
    )
      issues.push(`Native semantic alias must remain unique: ${declaration}`);
  }
  const semantics = semanticDeclarations(css);
  for (const role of [
    '--color-text-primary-token',
    '--color-text-secondary-token',
    '--color-text-tertiary-token',
  ]) {
    for (const surface of Object.values(palette.elevations.dark)) {
      if (contrastRatio(resolveSemantic(role, semantics), surface) < 4.5)
        issues.push(
          `Native normal text contrast below 4.5: ${role} / ${surface}`
        );
    }
  }
  const measured = measureNativePaint(root, manifest);
  issues.push(...measured.issues);
  const debt = JSON.parse(
    readFileSync(resolve(root, manifest.paintDebt), 'utf8')
  );
  issues.push(...paintRatchet(measured.debt, debt.identities));
  const ceiling = trustedPaintCeiling(root, manifest);
  for (const [key, count] of Object.entries(debt.identities)) {
    if (count > (ceiling[key] || 0))
      issues.push(`Raw-paint floor may not grow against Git base: ${key}`);
  }
  for (const path of manifest.strictSources) {
    const source = readFileSync(resolve(root, path), 'utf8');
    for (const row of rawColors(source))
      issues.push(`${path}:${row.line}: raw color ${row.expression}`);
    for (const value of nativeSpacing(source))
      issues.push(`${path}: off-grid spacing ${value}`);
  }
  const rootView = readFileSync(
    resolve(root, 'apps/ios/Jovie/App/RootView.swift'),
    'utf8'
  );
  if (
    !/launchMode == \.uiTestingWhatsNew\s*\{\s*changelogWhatsNew =/.test(
      rootView
    )
  )
    issues.push(
      'What’s New UI fixture must mount the production changelog sheet'
    );
  const production = rootView.slice(
    rootView.indexOf('struct JovieChangelogWhatsNewView: View')
  );
  if (/foregroundStyle\(JovieColor\.accent\w*\)/.test(production))
    issues.push('Decorative What’s New glyphs must use neutral semantic ink');
  return issues;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const rootIndex = process.argv.indexOf('--root');
    const root = rootIndex >= 0 ? resolve(process.argv[rootIndex + 1]) : ROOT;
    const issues = checkNativeDesign(root, {
      write: process.argv.includes('--write'),
    });
    for (const issue of issues) process.stderr.write(`${issue}\n`);
    process.stdout.write(
      `[native-design-system] ${issues.length ? 'FAIL' : 'PASS'}\n`
    );
    process.exitCode = issues.length ? 1 : 0;
  } catch (error) {
    process.stderr.write(`[native-design-system] FAIL: ${error.message}\n`);
    process.exitCode = 1;
  }
}
