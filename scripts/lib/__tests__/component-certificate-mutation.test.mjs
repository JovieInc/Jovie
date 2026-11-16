import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildMutationInventory,
  mutationStateKey,
  mutationTestsFor,
} from '../component-certificate-mutation.mjs';
import { moduleKey } from '../mutation-sweep.mjs';

const CLI = resolve(
  import.meta.dirname,
  '..',
  '..',
  'component-certificate.mjs'
);
const UI_NOTE = 'packages/ui/atoms/note.tsx';

describe('mutation inventory per workspace root', () => {
  const texts = {
    'packages/ui/atoms/badge.tsx': 'ui badge',
    'packages/ui/atoms/badge.test.tsx': 'ui badge test',
    'apps/web/components/atoms/badge.tsx': 'web badge',
    'apps/web/components/atoms/badge.test.tsx': 'web badge test',
    'apps/web/lib/badge.test.ts': 'web lib badge test',
  };
  const inventory = buildMutationInventory(
    Object.keys(texts),
    path => texts[path] ?? null
  );

  it('binds packages/ui components to packages/ui same-stem tests only', () => {
    expect(mutationTestsFor(inventory, 'packages/ui/atoms/badge.tsx')).toEqual([
      'ui badge test',
    ]);
  });

  it('keeps apps/web same-stem tests across apps/web, without packages/ui ones', () => {
    expect(
      mutationTestsFor(inventory, 'apps/web/components/atoms/badge.tsx')
    ).toEqual(['web badge test', 'web lib badge test']);
  });

  it('is null for untracked or unswept paths and without an inventory', () => {
    expect(mutationTestsFor(inventory, 'packages/ui/atoms/kbd.tsx')).toBeNull();
    expect(mutationTestsFor(inventory, 'packages/api/badge.tsx')).toBeNull();
    expect(mutationTestsFor(null, 'packages/ui/atoms/badge.tsx')).toBeNull();
  });

  it('is empty, not null, for a tracked module with no same-stem test', () => {
    const lone = buildMutationInventory(['packages/ui/atoms/x.tsx'], () => '');
    expect(mutationTestsFor(lone, 'packages/ui/atoms/x.tsx')).toEqual([]);
  });

  it('uses the sweep state keys: apps/web-relative, packages/ui by repo path', () => {
    expect(mutationStateKey('apps/web/components/atoms/badge.tsx')).toBe(
      'components/atoms/badge.tsx'
    );
    expect(mutationStateKey('packages/ui/atoms/badge.tsx')).toBe(
      'packages/ui/atoms/badge.tsx'
    );
  });
});

describe('certificate CLI reads packages/ui sweep evidence', () => {
  let root;
  const git = (...args) => {
    const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
    return r.stdout;
  };
  const write = (rel, text) => {
    mkdirSync(join(root, dirname(rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  };
  // The sweep's key: index blob of the source plus index blobs of the
  // same-stem tests under the same root (git ls-files -s -- packages/ui).
  const sweepKey = () => {
    const blobs = new Map(
      git('ls-files', '-s', '--', 'packages/ui')
        .trim()
        .split('\n')
        .map(row => /^\d+ ([0-9a-f]{40}) \d\t(.+)$/u.exec(row))
        .map(m => [m[2], m[1]])
    );
    const tests = [...blobs]
      .filter(([path]) => /\/note\.test\.tsx?$/u.test(path))
      .map(([, blob]) => blob);
    return moduleKey(blobs.get(UI_NOTE), tests);
  };
  const mutation = state => {
    const args = [CLI, '--repo-root', root, '--component', UI_NOTE];
    const out = join(root, 'report.json');
    if (state) {
      writeFileSync(join(root, 'state.json'), JSON.stringify(state));
      args.push('--mutation-state', join(root, 'state.json'));
    }
    const r = spawnSync(process.execPath, [...args, '--out', out], {
      encoding: 'utf8',
    });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    const [cert] = JSON.parse(readFileSync(out, 'utf8')).certificates;
    return cert.criteria.find(c => c.id === 'mutation');
  };
  const scored = (score, blob = sweepKey()) => ({
    schemaVersion: 1,
    modules: {
      [UI_NOTE]: {
        blob,
        sha: 'a'.repeat(40),
        at: '2026-11-08T00:00:00Z',
        status: 'scored',
        score,
        valid: 20,
        killed: Math.round(score / 5),
        survived: 20 - Math.round(score / 5),
        durationMs: 1,
      },
    },
  });

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'cert-ui-mutation-'));
    write(
      UI_NOTE,
      "export function Note({ children }: { children: React.ReactNode }) {\n  return <p className='text-sm text-secondary-token'>{children}</p>;\n}\n"
    );
    write('packages/ui/atoms/note.test.tsx', "it('renders', () => {});\n");
    // A same-stem apps/web test must not enter the packages/ui key.
    write('apps/web/components/note.test.tsx', "it('web', () => {});\n");
    git('init', '-q');
    git('add', '-A');
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('turns mutation from unknown into pass or fail on the sweep key', () => {
    expect(mutation(null).status).toBe('unknown');
    expect(mutation(scored(90))).toMatchObject({ status: 'pass', score: 90 });
    expect(mutation(scored(50))).toMatchObject({ status: 'fail', score: 50 });
  });

  it('stays unknown when the key was taken over different test bytes', () => {
    const stale = scored(90);
    write('packages/ui/atoms/note.test.tsx', "it('changed', () => {});\n");
    expect(mutation(stale).status).toBe('unknown');
  });

  it('stays unknown when the state is keyed apps/web-relative', () => {
    const state = scored(90);
    state.modules['atoms/note.tsx'] = state.modules[UI_NOTE];
    delete state.modules[UI_NOTE];
    expect(mutation(state).status).toBe('unknown');
  });
});
