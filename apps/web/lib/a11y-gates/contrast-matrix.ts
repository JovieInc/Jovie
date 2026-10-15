import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  type ContrastPair,
  type ContrastRunResult,
  defaultCssFiles,
  extractRules,
  loadPairsConfig,
  loadThemeTablesFromFiles,
  type PairResultRecord,
  parseColor,
  resolveValue,
  runContrastChecks,
  type ThemeTables,
} from './contrast-engine';

/** [worst ratio across underlays, number of failing checks] per pair/theme. */
export type ContrastBaseline = Readonly<
  Record<string, readonly [number, number]>
>;

const PAPER_SURFACE = '--color-bg-paper';

/**
 * Paper stays #f7f8f8 in dark themes. Canvas tertiary is the muted gray
 * those themes use on near-black; paper rebinds to the light token.
 */
const LIGHT_READING_TEXT: Readonly<Record<string, string>> = {
  '--color-text-tertiary-token': '--color-text-tertiary-on-light',
};

function lightReadingSource(
  fg: string,
  bg: string,
  underlay: string | undefined,
  table: Map<string, string>
): string | undefined {
  const source = LIGHT_READING_TEXT[fg];
  if (!source || !table.has(source)) return undefined;
  if (bg !== PAPER_SURFACE && underlay !== PAPER_SURFACE) return undefined;
  return source;
}

function isLightReadingSwatch(token: string): boolean {
  return token.endsWith('-on-light');
}

/**
 * Discover semantic token families rather than maintaining a pair allowlist.
 * Ordinary text is checked on every neutral surface and state; inverse,
 * tooltip, button and status foregrounds use their contextual backgrounds.
 * Disabled text is measured at 1:1 (WCAG exempts inactive controls).
 */
export function generateTokenPairs(tables: ThemeTables): ContrastPair[] {
  const pairs: ContrastPair[] = [];
  for (const [theme, table] of Object.entries(tables)) {
    const tokens = [...table.keys()].sort();
    const isSurface = (token: string) =>
      /^--(?:color|linear|system-b)-(?:bg|surface)-/.test(token) ||
      token === '--app-shell-content-surface';
    const surfaces = tokens.filter(
      t => isSurface(t) && !t.endsWith('-tooltip')
    );
    const tints = tokens.filter(t =>
      /^--color-(?:interactive|cell|row|button)-.*(?:hover|active|selected)$/.test(
        t
      )
    );
    const opaque = surfaces.filter(t => {
      const value = resolveValue(`var(${t})`, table);
      return value && parseColor(value)?.alpha === 1;
    });
    if (!opaque.length) throw new Error(`No opaque surfaces in ${theme}`);

    const add = (fg: string, bg: string, minRatio = 4.5) => {
      const value = resolveValue(`var(${bg})`, table);
      // Unknown formats still produce a pair and fail closed in checkPair.
      const underlays =
        value && parseColor(value)?.alpha === 1 ? [undefined] : opaque;
      for (const underlay of underlays) {
        const fgSource = lightReadingSource(fg, bg, underlay, table);
        pairs.push({
          name: `${fg} on ${bg}${underlay ? ` over ${underlay}` : ''}`,
          fg,
          bg,
          minRatio,
          underlay,
          themes: [theme],
          ...(fgSource ? { fgSource } : {}),
        });
      }
    };
    const text = tokens.filter(
      t =>
        /^--(?:color|linear|system-b)-text-/.test(t) &&
        !t.endsWith('-tooltip') &&
        !t.endsWith('-inverse') &&
        !isLightReadingSwatch(t)
    );
    const backgrounds = [...surfaces, ...tints];
    const statusTints = tokens.filter(t =>
      /^--color-(?:success|warning|danger|error|info)-subtle$/.test(t)
    );
    for (const fg of text) {
      for (const bg of [...backgrounds, ...statusTints].filter(
        bg => !fg.startsWith('--linear-') || bg.startsWith('--linear-')
      ))
        add(fg, bg, fg.includes('-disabled-') ? 1 : 4.5);
    }
    for (const prefix of ['--color', '--linear']) {
      if (table.has(`${prefix}-text-tooltip`)) {
        for (const bg of tokens.filter(
          t => t === `${prefix}-bg-tooltip` || t === `${prefix}-surface-tooltip`
        ))
          add(`${prefix}-text-tooltip`, bg);
      }
      if (table.has(`${prefix}-text-inverse`)) {
        for (const bg of tokens.filter(
          t =>
            t.startsWith(`${prefix}-btn-primary-`) &&
            /-(?:bg|hover|active|selected)$/.test(t)
        )) {
          add(`${prefix}-text-inverse`, bg);
        }
      }
    }
    // Buttons/badges include every declared state, including future states.
    for (const fg of tokens.filter(t =>
      /^--(?:color|linear)-btn-.*-fg$/.test(t)
    )) {
      const stem = fg.slice(0, -3);
      for (const bg of tokens.filter(
        t =>
          t.startsWith(`${stem}-`) && /-(?:bg|hover|active|selected)$/.test(t)
      ))
        add(fg, bg);
    }
    for (const fg of tokens.filter(t => /^--color-.*-foreground$/.test(t))) {
      const stem = fg.slice(0, -11);
      for (const bg of tokens.filter(
        t =>
          t === stem ||
          (t.startsWith(`${stem}-`) && /-(?:hover|active|selected)$/.test(t))
      ))
        add(fg, bg);
    }
    if (table.has('--color-badge-text'))
      add('--color-badge-text', '--color-badge-bg');
    if (table.has('--system-b-primary-fg'))
      add('--system-b-primary-fg', '--system-b-primary-bg');
    if (table.has('--system-b-entity-chip-on-light-text'))
      add(
        '--system-b-entity-chip-on-light-text',
        '--system-b-chat-user-bubble-bg'
      );
    if (table.has('--system-b-chat-user-bubble-text'))
      add('--system-b-chat-user-bubble-text', '--system-b-chat-user-bubble-bg');

    // The status signal is text on neutral/state surfaces and its own tint;
    // its non-text use gets an independent 3:1 check. On solid fills, use
    // the declared *-foreground token, never the signal itself.
    for (const status of tokens.filter(t =>
      /^--color-(?:success|warning|danger|error|info)$/.test(t)
    )) {
      for (const bg of [...backgrounds, `${status}-subtle`]) {
        add(status, bg);
        add(status, bg, 3);
      }
    }
    const covered = new Set(
      pairs.filter(p => p.themes?.includes(theme)).flatMap(p => [p.fg, p.bg])
    );
    const required = tokens.filter(
      t =>
        (/^--(?:color|linear|system-b)-text-/.test(t) &&
          !isLightReadingSwatch(t)) ||
        /^--(?:color|linear)-btn-.*-(?:fg|hover|active|selected)$/.test(t) ||
        /^--color-.*-foreground$/.test(t) ||
        /^--color-(?:bg|surface|interactive|cell|row|button)-.*(?:hover|active|selected)$/.test(
          t
        )
    );
    for (const token of required) {
      if (!covered.has(token))
        throw new Error(`Uncovered contrast token in ${theme}: ${token}`);
    }
  }
  return pairs;
}

/** Include the app frame and marketing dark cascades that override root tokens. */
export async function loadGateTables(webRoot: string): Promise<ThemeTables> {
  const tables = loadThemeTablesFromFiles(defaultCssFiles(webRoot));
  // Tailwind @theme inline surfaces compile to these same runtime aliases.
  const foundation = await readFile(
    join(webRoot, 'styles/tailwind-foundation.css'),
    'utf8'
  );
  for (const rule of extractRules(
    foundation.replace(/@theme(?:\s+inline)?/g, ':root')
  )) {
    if (rule.selector !== ':root') continue;
    for (const [token, value] of rule.declarations) {
      if (!token.startsWith('--color-surface-')) continue;
      tables.light.set(token, value);
      tables.dark.set(token, value);
    }
  }
  const scopes = [
    {
      name: 'dark app frame',
      file: 'system-b-app.css',
      selector: '[data-app-shell-frame="true"].dark',
    },
    {
      name: 'dark marketing',
      file: 'design-system.css',
      selector: '.system-b-marketing.dark',
    },
  ];
  for (const { name, file, selector } of scopes) {
    const table = new Map(tables.dark);
    let matched = false;
    for (const rule of extractRules(
      await readFile(join(webRoot, 'styles', file), 'utf8')
    )) {
      if (
        rule.atContext ||
        !rule.selector.split(',').some(s => s.trim() === selector)
      )
        continue;
      matched = true;
      for (const [token, value] of rule.declarations) table.set(token, value);
    }
    if (!matched) throw new Error(`Missing contrast scope: ${selector}`);
    Object.assign(tables, { [name]: table });
  }
  return tables;
}

/** Stable per-pair identity prevents trading one debt item for another. */
export function contrastKey(pair: PairResultRecord): string {
  return [
    pair.theme,
    pair.fg,
    pair.bg.replace(/^--color-surface-/, '--color-bg-'),
  ]
    .join('|')
    .replaceAll('--color-', '');
}

export function failureBaseline(result: ContrastRunResult): ContrastBaseline {
  const debt: Record<string, [number, number]> = {};
  for (const f of result.failures) {
    if (f.ratio === undefined || !Number.isFinite(f.ratio))
      throw new Error('Missing contrast ratio');
    const key = contrastKey(f);
    const [floor, count] = debt[key] ?? [21, 0];
    debt[key] = [Math.min(floor, Math.floor(f.ratio * 1e6) / 1e6), count + 1];
  }
  return Object.fromEntries(
    Object.entries(debt).sort(([a], [b]) => a.localeCompare(b))
  );
}

/** Any unmeasured pair, new failure, worse floor or increased debt blocks. */
export function contrastRegressions(
  result: ContrastRunResult,
  baseline: ContrastBaseline
): string[] {
  const errors = result.warnings.map(w => `${contrastKey(w)}: ${w.detail}`);
  for (const [key, [ratio, count]] of Object.entries(failureBaseline(result))) {
    const [floor, ceiling] = baseline[key] ?? [21, 0];
    if (
      !Number.isFinite(floor) ||
      !Number.isInteger(ceiling) ||
      floor < 1 ||
      ceiling < 1 ||
      ratio < floor ||
      count > ceiling
    ) {
      errors.push(
        `${key}: worst ${ratio}:1, ${count} failures (baseline ${floor}:1, ${ceiling} failures)`
      );
    }
  }
  return errors;
}

export async function loadContrastGate(webRoot: string) {
  const tables = await loadGateTables(webRoot);
  const pairs = [
    ...loadPairsConfig(join(webRoot, 'contrast-pairs.config.json')),
    ...generateTokenPairs(tables),
  ];
  const result = runContrastChecks(pairs, tables);
  const baseline = JSON.parse(
    await readFile(join(webRoot, 'contrast-computed.baseline.json'), 'utf8')
  ) as ContrastBaseline;
  return { ...result, baseline, errors: contrastRegressions(result, baseline) };
}
