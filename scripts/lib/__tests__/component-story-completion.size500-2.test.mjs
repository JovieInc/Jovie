import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { storyReceipt } from '../component-evidence.mjs';
import { snapshotRenderInputs } from '../component-render-inputs.mjs';
import { requireCurrentStoryCache } from '../component-story-completion.mjs';

const fixtureRoots = [];
afterEach(() => {
  for (const root of fixtureRoots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
function cacheFixture(status = 'pass') {
  const base = mkdtempSync(join(tmpdir(), 'current-story-cache-'));
  fixtureRoots.push(base);
  const root = join(base, 'checkout');
  const cache = join(base, 'cache');
  mkdirSync(root);
  mkdirSync(cache);
  execFileSync('git', ['init', '-q'], {
    cwd: root,
    env: Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))
    ),
  });
  const put = (path, bytes) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), bytes);
  };
  const component = 'packages/ui/atoms/proof.tsx';
  put('package.json', '{}');
  put(component, 'export const Proof = () => null;');
  put('apps/web/app/globals.css', 'body { color: black; }');
  const record = {
    ...storyReceipt(
      createHash('sha256')
        .update(readFileSync(join(root, component)))
        .digest('hex'),
      ['proof--default'],
      snapshotRenderInputs(root).binding
    ),
    status,
    detail: status === 'fail' ? 'measured violation' : undefined,
  };
  for (const kind of ['visual', 'a11y'])
    writeFileSync(
      join(cache, `${kind}.json`),
      JSON.stringify({ components: { [component]: record } })
    );
  const change = mutate => {
    const path = join(cache, 'a11y.json');
    const data = JSON.parse(readFileSync(path, 'utf8'));
    mutate(data.components[component], data);
    writeFileSync(path, JSON.stringify(data));
  };
  return { root, cache, component, put, change };
}

describe('current capture bindings before refresh admission', () => {
  it.each(['pass', 'fail'])(
    'retains current %s observations across unrelated CI advancement',
    status => {
      const f = cacheFixture(status);
      f.put('.github/workflows/unrelated-ci.yml', 'name: unrelated CI change');
      expect(() => requireCurrentStoryCache(f.root, f.cache)).not.toThrow();
      expect(
        JSON.parse(readFileSync(join(f.cache, 'a11y.json'), 'utf8')).components[
          f.component
        ].status
      ).toBe(status);
      f.put('apps/web/app/globals.css', 'body { color: red; }');
      expect(() => requireCurrentStoryCache(f.root, f.cache)).toThrow(
        'binding'
      );
    }
  );
  it('names the stale component and the failing class in the refusal', () => {
    const sourceDrift = cacheFixture();
    sourceDrift.put(sourceDrift.component, 'export const Proof = () => false;');
    expect(() =>
      requireCurrentStoryCache(sourceDrift.root, sourceDrift.cache)
    ).toThrow(
      `${sourceDrift.component}: the captured component source changed since the capture`
    );
    const inputsDrift = cacheFixture();
    inputsDrift.change(record => {
      record.renderInputs.digest = '0'.repeat(64);
    });
    expect(() =>
      requireCurrentStoryCache(inputsDrift.root, inputsDrift.cache)
    ).toThrow(
      `${inputsDrift.component}: the captured render inputs changed since the capture`
    );
  });
  it.each([
    [
      'source drift',
      f => f.put(f.component, 'export const Proof = () => false;'),
    ],
    [
      'wrong source hash',
      f =>
        f.change(record => {
          record.sourceHash = '0'.repeat(64);
        }),
    ],
    [
      'wrong profile digest',
      f =>
        f.change(record => {
          record.renderInputs.digest = '0'.repeat(64);
        }),
    ],
    [
      'wrong mode',
      f =>
        f.change(record => {
          record.renderInputs.mode = 'storybook-live-cert';
        }),
    ],
    [
      'invalid negative schema',
      f =>
        f.change(record => {
          record.status = 'fail';
          record.schema = 'unsupported';
        }),
    ],
    [
      'partial passing themes',
      f =>
        f.change(record => {
          record.stories[0].themes = ['light'];
        }),
    ],
    [
      'missing records',
      f =>
        f.change((_record, data) => {
          data.components = {};
        }),
    ],
    ['missing file', f => rmSync(join(f.cache, 'a11y.json'))],
    ['corrupt JSON', f => writeFileSync(join(f.cache, 'a11y.json'), '{')],
  ])('refuses %s before entering certificate concurrency', (_name, mutate) => {
    const f = cacheFixture();
    mutate(f);
    expect(() => requireCurrentStoryCache(f.root, f.cache)).toThrow();
  });
});
