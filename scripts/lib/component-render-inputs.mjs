/** Conservative render provenance: one current-byte snapshot for the whole run.
 * Tailwind scans beyond import closures, so all frontend/workspace inputs count.
 * Git supplies inventory only; never substitute index blobs for working bytes.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  lstatSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { join, relative, resolve } from 'node:path';

export const RENDER_INPUT_SCHEMA = 'jovie.component-render-inputs/v1';
export const STORYBOOK_PROFILE = Object.freeze({
  JOVIE_LIVE_STORYBOOK_CERT: '',
  JOVIE_STORYBOOK_MANUAL_AXE: '1',
  JOVIE_STORYBOOK_A11Y_CONTROLS: '',
  NODE_ENV: 'development',
  NEXT_PUBLIC_APP_VERSION: '0.0.0-storybook',
  NEXT_PUBLIC_BUILD_SHA: 'storybook',
  NEXT_PUBLIC_CI: '',
  NEXT_PUBLIC_DEMO_RECORDING: '',
  CI: 'true',
});
const ROOT_INPUT =
  /^(?:package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|\.nvmrc|\.node-version|\.npmrc|\.gitignore|\.gitattributes|\.?pnpmfile\.[cm]?js|tsconfig[^/]*\.json|(?:postcss|tailwind|vite)\.config\.[^/]+)$/;
const PRODUCER_INPUTS = new Set([
  'scripts/component-story-evidence.mjs',
  'scripts/component-ship-policy.mjs',
  'scripts/lib/component-story-evidence-lib.mjs',
  'scripts/lib/component-evidence.mjs',
  'scripts/lib/component-story-receipts.mjs',
  'scripts/lib/component-render-inputs.mjs',
  '.github/workflows/visual-a11y.yml',
]);
// These support directories contain imported Storybook/runtime code and assets.
const RUNTIME_SUPPORT_INPUT = /^apps\/web\/(?:tests\/fixtures|lib\/docs)\//;
/** Mirrors the workflow's render-only eligibility, preserving its older matrix. */
export function isRenderInput(path) {
  if (ROOT_INPUT.test(path) || PRODUCER_INPUTS.has(path)) return true;
  return (
    /^(?:apps\/web|packages|patches)\//.test(path) &&
    !/^apps\/web\/app\/(?:api|actions)\//.test(path) &&
    !/(?:^|\/)__tests__\//.test(path) &&
    (RUNTIME_SUPPORT_INPUT.test(path) ||
      !/(?:^|\/)(?:tests|docs)\//.test(path)) &&
    !/\.(?:test|spec)\.|\.md$/.test(path)
  );
}

const LEGACY_VISUAL =
  /^(?:apps\/web\/(?:components\/|\.storybook\/|app\/globals\.css$|styles\/|(?:tailwind|postcss)\.config\.|vitest\.config\.storybook\.mts$|package\.json$)|packages\/ui\/|pnpm-lock\.yaml$|\.github\/workflows\/visual-a11y\.yml$|scripts\/lib\/component-certificate-summary\.mjs$)/;
export function storyEvidenceEligibility(paths) {
  const visual = paths.some(path => LEGACY_VISUAL.test(path));
  return { visual, render: visual || paths.some(isRenderInput) };
}

/** Actual producer settings; the consumer always expects STORYBOOK_PROFILE. */
export function storybookProfile(env) {
  return Object.fromEntries(
    Object.entries(STORYBOOK_PROFILE).map(([key, value]) => [
      key,
      env[key] ||
        (key === 'JOVIE_STORYBOOK_MANUAL_AXE' || key === 'CI' ? '' : value),
    ])
  );
}

/** @param {string} root
 * @param {Record<string,string>} [profile]
 * @returns {{binding: {schema: string, digest: string, mode: string}|null, problem: string|null, files: number, bytes: number}} */
export function snapshotRenderInputs(root, profile = STORYBOOK_PROFILE) {
  let files = 0,
    bytes = 0;
  try {
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))
    );
    if (
      resolve(
        execFileSync('git', ['rev-parse', '--show-toplevel'], {
          cwd: root,
          env,
          encoding: 'utf8',
        }).trim()
      ) !== resolve(root)
    )
      throw new Error('render root is not the Git worktree root');
    const paths = [
      ...new Set(
        execFileSync(
          'git',
          ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
          {
            cwd: root,
            env,
            encoding: 'utf8',
            maxBuffer: 32 * 1024 * 1024,
          }
        )
          .split('\0')
          .filter(Boolean)
          .filter(isRenderInput)
      ),
    ].sort();
    if (!paths.length) throw new Error('no render inputs');
    const hash = createHash('sha256').update(
      `${RENDER_INPUT_SCHEMA}\0${JSON.stringify(profile)}\0`
    );
    for (const path of paths) {
      const absolute = join(root, path),
        entry = lstatSync(absolute);
      let target = '';
      if (entry.isSymbolicLink()) {
        target = readlinkSync(absolute);
        const resolved = realpathSync(absolute),
          within = relative(realpathSync(root), resolved);
        if (
          within === '..' ||
          within.startsWith('../') ||
          !statSync(resolved).isFile()
        )
          throw new Error(`unsafe render symlink: ${path}`);
      } else if (!entry.isFile())
        throw new Error(`non-file render input: ${path}`);
      const data = readFileSync(absolute);
      hash.update(`${path}\0${target}\0${data.length}\0`).update(data);
      files++;
      bytes += data.length;
    }
    return {
      binding: {
        schema: RENDER_INPUT_SCHEMA,
        digest: hash.digest('hex'),
        mode:
          profile.JOVIE_LIVE_STORYBOOK_CERT === '1'
            ? 'storybook-live'
            : 'storybook-full',
      },
      problem: null,
      files,
      bytes,
    };
  } catch (error) {
    return { binding: null, problem: error.message, files, bytes };
  }
}

/** @param {string} root @param {Map<string,string[]>} selected @param {NodeJS.ProcessEnv} env */
export function storyComponentInputs(root, selected, env) {
  const { binding: renderInputs, problem } = snapshotRenderInputs(
    root,
    storybookProfile(env)
  );
  if (problem) throw new Error(`render inputs unavailable: ${problem}`);
  const components = new Map();
  for (const [path, storyIds] of selected)
    components.set(path, {
      storyIds,
      renderInputs,
      sourceHash: createHash('sha256')
        .update(readFileSync(join(root, path)))
        .digest('hex'),
    });
  return components;
}

export function renderBindingProblem(binding) {
  return binding?.schema !== RENDER_INPUT_SCHEMA ||
    binding?.mode !== 'storybook-full' ||
    !/^[0-9a-f]{64}$/.test(binding?.digest ?? '')
    ? 'missing or invalid render input binding'
    : null;
}

/** Both successful and failed historical observations need current inputs. */
export function renderReceiptCurrent(receipt, sourceHash, expected) {
  return (
    !!receipt &&
    receipt.sourceHash === sourceHash &&
    !renderBindingProblem(expected) &&
    !renderBindingProblem(receipt.renderInputs) &&
    receipt.renderInputs.digest === expected.digest
  );
}
