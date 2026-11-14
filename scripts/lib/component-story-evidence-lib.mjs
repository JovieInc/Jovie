/**
 * Pure logic for the @jovie/ui story-capture producer
 * (scripts/component-story-evidence.mjs). No browser, no network, no fs.
 *
 * The producer captures every packages/ui story in light and dark and writes
 * `jovie.component-story-evidence/v1` receipts for the component certificate.
 * A component passes only when every one of its stories passed in both
 * themes; anything missing or red makes the whole receipt `fail`.
 */
import { posix } from 'node:path';
import {
  mergeEvidence,
  REQUIRED_THEMES,
  STORY_EVIDENCE_SCHEMA,
} from './component-evidence.mjs';

export const STORY_THEMES = REQUIRED_THEMES;
export const UI_PREFIX = 'packages/ui/';
/** The theme key the Storybook preview's ThemeProvider reads (preview.tsx). */
export const THEME_STORAGE_KEY = 'jovie-theme-storybook';
const STORY_FILE_RE = /^(.+)\.stories\.(tsx|ts|jsx|js)$/i;
const DETAIL_LIMIT = 3;

/**
 * Storybook must never build or run on the self-hosted runner (gem). Only a
 * GitHub-hosted runner, or an explicit `--local` developer run off any
 * self-hosted runner, may capture.
 * @returns {string | null} why the run is refused, or null when allowed
 */
export function runnerRefusal(env = {}, { local = false } = {}) {
  const runner = env.RUNNER_ENVIRONMENT;
  if (runner === 'github-hosted') return null;
  if (runner === 'self-hosted')
    return 'refusing to run Storybook on a self-hosted runner (gem); use a GitHub-hosted runner';
  if (local && !env.GITHUB_ACTIONS) return null;
  return 'story capture runs only on GitHub-hosted runners (RUNNER_ENVIRONMENT=github-hosted) or with --local off CI';
}

/** @returns {{ index: number, total: number }} 1-based shard */
export function parseShard(value) {
  if (value === undefined || value === null || value === '')
    return { index: 1, total: 1 };
  const match = /^(\d+)\/(\d+)$/.exec(String(value));
  const index = match ? Number(match[1]) : Number.NaN;
  const total = match ? Number(match[2]) : Number.NaN;
  if (!(total >= 1 && index >= 1 && index <= total))
    throw new Error(`invalid --shard ${value}; expected i/n with 1 <= i <= n`);
  return { index, total };
}

/**
 * Repo-relative path of a Storybook `importPath`. Storybook runs from
 * apps/web, so `../../packages/ui/x.stories.tsx` is `packages/ui/x.stories.tsx`;
 * an index generated from the repo root uses `./packages/ui/...` instead.
 * @returns {string | null}
 */
export function repoPathForImport(importPath, storybookCwd = 'apps/web') {
  if (typeof importPath !== 'string' || !importPath) return null;
  const clean = importPath.replace(/\\/g, '/');
  for (const candidate of [
    posix.normalize(posix.join(storybookCwd, clean)),
    posix.normalize(clean),
  ])
    if (!candidate.startsWith('../') && candidate.startsWith(UI_PREFIX))
      return candidate;
  return null;
}

/**
 * The component a story file covers: `button.stories.tsx` and its companion
 * `button.states.stories.tsx` both cover `button.tsx` in the same directory
 * (matched case-insensitively, like the coverage policy: `Card.stories.tsx`
 * covers `card.tsx`). The longest matching base wins.
 * @param {string} storyRel repo-relative story file
 * @param {Iterable<string>} componentPaths repo-relative component sources
 * @returns {string | null}
 */
export function componentForStoryFile(storyRel, componentPaths) {
  const dir = posix.dirname(storyRel);
  const match = STORY_FILE_RE.exec(posix.basename(storyRel));
  if (!match) return null;
  const byBase = new Map();
  for (const path of componentPaths)
    if (posix.dirname(path) === dir)
      byBase.set(
        posix
          .basename(path)
          .replace(/\.tsx$/i, '')
          .toLowerCase(),
        path
      );
  const parts = match[1].toLowerCase().split('.');
  for (let n = parts.length; n >= 1; n--) {
    const hit = byBase.get(parts.slice(0, n).join('.'));
    if (hit) return hit;
  }
  return null;
}

/**
 * Stories (never docs entries) whose file lives under packages/ui, grouped
 * by the component they cover.
 * @returns {{ components: Map<string, string[]>, unmapped: string[] }}
 */
export function selectUiStories(index, componentPaths, storybookCwd) {
  const entries = Object.values(index?.entries ?? index?.stories ?? {});
  const paths = [...componentPaths];
  const components = new Map();
  const unmapped = new Set();
  for (const entry of entries) {
    if (!entry || entry.type !== 'story' || typeof entry.id !== 'string')
      continue;
    const storyRel = repoPathForImport(entry.importPath, storybookCwd);
    if (!storyRel) continue;
    const component = componentForStoryFile(storyRel, paths);
    if (!component) {
      unmapped.add(storyRel);
      continue;
    }
    components.set(component, [...(components.get(component) ?? []), entry.id]);
  }
  for (const [path, ids] of components)
    components.set(path, [...new Set(ids)].sort());
  return {
    components: new Map([...components].sort(([a], [b]) => a.localeCompare(b))),
    unmapped: [...unmapped].sort(),
  };
}

/**
 * Whole components per shard, so each shard writes complete receipts and a
 * merge never has to join one component's stories. Greedy by story count,
 * largest first, ties by path: deterministic for every shard.
 * @param {Map<string, string[]>} components
 * @returns {Map<string, string[]>}
 */
export function shardComponents(components, { index, total }) {
  const loads = Array.from({ length: total }, () => 0);
  const owned = new Map();
  const order = [...components].sort(
    ([pa, a], [pb, b]) => b.length - a.length || pa.localeCompare(pb)
  );
  for (const [path, ids] of order) {
    let target = 0;
    for (let i = 1; i < total; i++) if (loads[i] < loads[target]) target = i;
    loads[target] += ids.length;
    if (target === index - 1) owned.set(path, ids);
  }
  return new Map([...owned].sort(([a], [b]) => a.localeCompare(b)));
}

/** The preview iframe for one story; the theme is seeded via localStorage. */
export function storyUrl(baseUrl, storyId) {
  const base = String(baseUrl).replace(/\/+$/, '');
  return `${base}/iframe.html?id=${encodeURIComponent(storyId)}&viewMode=story`;
}

/**
 * Problems for one story × theme capture. `kind` is `visual` (it rendered,
 * cleanly, in the requested theme, and was screenshotted) or `a11y` (the
 * same, plus zero WCAG 2.2 AA violations).
 * @param {{ rendered?: boolean, appliedTheme?: string | null, pinnedTheme?: string | null, errors?: string[], violations?: Array<{ id: string }>, screenshotSha256?: string | null }} result
 * @returns {string[]}
 */
export function captureProblems(result, theme, kind) {
  if (!result) return [`not captured in ${theme}`];
  const problems = [];
  if (!result.rendered) problems.push('did not render');
  for (const error of result.errors ?? []) problems.push(`error: ${error}`);
  if (result.rendered && result.appliedTheme !== theme)
    problems.push(
      `rendered ${result.appliedTheme ?? 'no theme'}, not ${theme}`
    );
  if (
    kind === 'visual' &&
    result.rendered &&
    !/^[0-9a-f]{64}$/.test(result.screenshotSha256 ?? '')
  )
    problems.push('no screenshot');
  if (kind === 'a11y') {
    const rules = [...new Set((result.violations ?? []).map(v => v.id))].sort();
    if (rules.length) problems.push(`axe ${rules.join(', ')}`);
  }
  return problems;
}

const shorten = text => String(text).replace(/\s+/g, ' ').trim().slice(0, 160);

/** The theme a story pins through its own globals, if any (either capture says). */
function pinnedTheme(id, results) {
  for (const theme of STORY_THEMES) {
    const pinned = results.get(`${id}\u0000${theme}`)?.pinnedTheme;
    if (STORY_THEMES.includes(pinned)) return pinned;
  }
  return null;
}

function receiptFor(
  kind,
  { sourceHash, storyIds, renderInputs = null },
  results
) {
  const stories = [];
  const failures = [];
  for (const id of storyIds) {
    // A story that pins one theme (e.g. OperationsDark) can't prove both, so
    // it is checked in its own theme only and left out of the light+dark list.
    const pinned = pinnedTheme(id, results);
    const themes = [];
    const screenshots = {};
    for (const theme of pinned ? [pinned] : STORY_THEMES) {
      const result = results.get(`${id}\u0000${theme}`);
      const problems = captureProblems(result, theme, kind);
      if (problems.length)
        failures.push(`${id} [${theme}]: ${shorten(problems.join('; '))}`);
      else {
        themes.push(theme);
        if (kind === 'visual') screenshots[theme] = result.screenshotSha256;
      }
    }
    if (pinned) continue;
    stories.push(
      kind === 'visual' ? { id, themes, screenshots } : { id, themes }
    );
  }
  const receipt = {
    schema: STORY_EVIDENCE_SCHEMA,
    sourceHash,
    renderInputs,
    status: failures.length || !stories.length ? 'fail' : 'pass',
    captured: stories.length,
    stories,
  };
  if (!stories.length) receipt.detail = 'no stories captured';
  else if (failures.length) {
    const more = failures.length - DETAIL_LIMIT;
    receipt.detail = [
      ...failures.slice(0, DETAIL_LIMIT),
      ...(more > 0 ? [`+${more} more`] : []),
    ].join(' | ');
  }
  return receipt;
}

/**
 * Visual and a11y evidence files from the captures of one run.
 * @param {Map<string, { sourceHash: string, storyIds: string[], renderInputs?: any }>} components
 * @param {Array<{ storyId: string, theme: string }>} captures
 * @returns {{ visual: { components: Record<string, any> }, a11y: { components: Record<string, any> } }}
 */
export function assembleEvidence(components, captures) {
  const results = new Map(
    captures.map(c => [`${c.storyId}\u0000${c.theme}`, c])
  );
  const visual = {};
  const a11y = {};
  for (const [path, input] of [...components].sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    visual[path] = receiptFor('visual', input, results);
    a11y[path] = receiptFor('a11y', input, results);
  }
  return { visual: { components: visual }, a11y: { components: a11y } };
}

export { mergeEvidence };

/** One line per component for the run log and step summary. */
export function summarizeEvidence({ visual, a11y }) {
  const lines = [];
  for (const path of Object.keys(visual.components)) {
    const v = visual.components[path];
    const a = a11y.components[path];
    lines.push(
      `${path}: visual ${v.status}, a11y ${a.status} (${v.captured} stories)` +
        (v.detail || a.detail
          ? ` - ${[v.detail, a.detail].filter(Boolean).join(' | ')}`
          : '')
    );
  }
  return lines;
}
