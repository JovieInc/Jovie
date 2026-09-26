import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { resetOwnedOutputDirectory } from './owned-output-directory';

const testRoots: string[] = [];

function makeOutputRoot(): string {
  const root = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), 'linear-output-')
  );
  testRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of testRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('resetOwnedOutputDirectory', () => {
  it('replaces artifacts from the same producer', () => {
    const root = makeOutputRoot();
    const output = resetOwnedOutputDirectory(root, 'dashboards');
    fs.writeFileSync(path.join(output, 'old.png'), 'old');

    const replacement = resetOwnedOutputDirectory(root, 'dashboards');

    expect(replacement).toBe(output);
    expect(fs.readdirSync(replacement)).toEqual([]);
  });

  it('preserves sibling producer outputs', () => {
    const root = makeOutputRoot();
    const sibling = resetOwnedOutputDirectory(root, 'landing-pages');
    fs.writeFileSync(path.join(sibling, 'confirmed.png'), 'keep');

    resetOwnedOutputDirectory(root, 'dashboards');

    expect(fs.readFileSync(path.join(sibling, 'confirmed.png'), 'utf8')).toBe(
      'keep'
    );
  });

  it.each([
    '../outside',
    'nested/producer',
    '.',
    '',
  ])('rejects a producer path outside one owned segment: %j', producer => {
    const root = makeOutputRoot();

    expect(() => resetOwnedOutputDirectory(root, producer)).toThrow(
      'Invalid output producer name'
    );
  });

  it('refuses to replace a symlinked producer directory', () => {
    const root = makeOutputRoot();
    const outside = makeOutputRoot();
    fs.writeFileSync(path.join(outside, 'preserved.txt'), 'keep');
    fs.symlinkSync(outside, path.join(root, 'dashboards'));

    expect(() => resetOwnedOutputDirectory(root, 'dashboards')).toThrow(
      'refuses to replace a symlinked output root'
    );
    expect(fs.readFileSync(path.join(outside, 'preserved.txt'), 'utf8')).toBe(
      'keep'
    );
  });

  it('refuses to replace a dangling producer symlink', () => {
    const root = makeOutputRoot();
    fs.symlinkSync(
      path.join(root, 'missing-target'),
      path.join(root, 'dashboards')
    );

    expect(() => resetOwnedOutputDirectory(root, 'dashboards')).toThrow(
      'refuses to replace a symlinked output root'
    );
  });

  it('refuses live and dangling symlinked output roots', () => {
    const outside = makeOutputRoot();
    fs.writeFileSync(path.join(outside, 'preserved.txt'), 'keep');

    const liveRootParent = makeOutputRoot();
    const liveRoot = path.join(liveRootParent, 'live-root');
    fs.symlinkSync(outside, liveRoot);
    expect(() => resetOwnedOutputDirectory(liveRoot, 'dashboards')).toThrow(
      'resolves outside its lexical root'
    );

    const danglingRootParent = makeOutputRoot();
    const danglingRoot = path.join(danglingRootParent, 'dangling-root');
    fs.symlinkSync(path.join(danglingRootParent, 'missing'), danglingRoot);
    expect(() => resetOwnedOutputDirectory(danglingRoot, 'dashboards')).toThrow(
      'resolves outside its lexical root'
    );
    expect(fs.readFileSync(path.join(outside, 'preserved.txt'), 'utf8')).toBe(
      'keep'
    );
  });

  it('unlinks child symlinks without touching their targets', () => {
    const root = makeOutputRoot();
    const outside = makeOutputRoot();
    fs.writeFileSync(path.join(outside, 'preserved.txt'), 'keep');
    const output = resetOwnedOutputDirectory(root, 'dashboards');
    fs.symlinkSync(outside, path.join(output, 'outside-link'));

    const replacement = resetOwnedOutputDirectory(root, 'dashboards');

    expect(fs.readdirSync(replacement)).toEqual([]);
    expect(fs.readFileSync(path.join(outside, 'preserved.txt'), 'utf8')).toBe(
      'keep'
    );
  });
});
