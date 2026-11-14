import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, it } from 'vitest';

const cli = join(
  dirname(dirname(dirname(fileURLToPath(import.meta.url)))),
  'component-certificate.mjs'
);
const component = 'packages/ui/atoms/note.tsx';
const atoms = 'packages/ui/atoms';

describe('component certificate companion files', () => {
  let root;
  const write = (name, text) => {
    mkdirSync(join(root, atoms), { recursive: true });
    writeFileSync(join(root, atoms, name), text);
  };
  const criteria = () => {
    const out = join(root, 'report.json');
    const result = spawnSync(
      process.execPath,
      [cli, '--repo-root', root, '--component', component, '--out', out],
      { encoding: 'utf8' }
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const [cert] = JSON.parse(readFileSync(out, 'utf8')).certificates;
    return Object.fromEntries(cert.criteria.map(c => [c.id, c.status]));
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'cert-companions-'));
    write(
      'note.tsx',
      "export function Note({ children }: { children: React.ReactNode }) {\n  return <p className='text-sm text-secondary-token'>{children}</p>;\n}\n"
    );
    write('note.test.tsx', "it('renders', () => { expect(1).toBe(1); });\n");
    write(
      'note.stories.tsx',
      "export default { title: 'UI/Note' };\nexport const Default = {};\n"
    );
    // A sibling whose name only shares a prefix is not a companion.
    write(
      'note-list.states.stories.tsx',
      'export const LongContent = {};\nexport const Rtl = {};\n'
    );
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('counts a11y and state evidence only from the component’s own files', () => {
    const before = criteria();
    assert.equal(before.states, 'fail');
    assert.equal(before.a11y, 'unknown');

    write(
      'note.certificate.test.tsx',
      "import { expectNoA11yViolations } from '../test-utils/a11y';\nit('axe', async () => { await expectNoA11yViolations(document.body); });\n"
    );
    write(
      'note.states.stories.tsx',
      "export default { title: 'UI/Note States' };\nexport const LongContent = {};\nexport const Rtl = {};\n"
    );
    const after = criteria();
    assert.equal(after.states, 'pass');
    assert.equal(after.a11y, 'pass');
    assert.equal(after.tests, 'pass');
  });

  it('gates an app-route component named by an exact gate key', () => {
    const app = 'apps/web/app/[slug]/_components';
    mkdirSync(join(root, app), { recursive: true });
    mkdirSync(join(root, 'docs/design-system'), { recursive: true });
    const gate = file =>
      writeFileSync(
        join(root, 'docs/design-system/component-certification.json'),
        JSON.stringify({ gates: { [file]: ['tests', 'a11y'] } })
      );
    const run = () =>
      spawnSync(process.execPath, [cli, '--repo-root', root, '--gate'], {
        encoding: 'utf8',
      });
    const source = `${app}/Banner.tsx`;
    writeFileSync(
      join(root, source),
      "export function Banner() {\n  return <p className='text-sm'>Hi</p>;\n}\n"
    );
    gate(source);
    const red = run();
    assert.equal(red.status, 1, red.stdout);
    assert.match(red.stdout, /Banner\.tsx \[tests\] fail/);

    writeFileSync(
      join(root, `${app}/Banner.test.tsx`),
      "import { expectNoA11yViolations } from 'x';\nit('axe', async () => { expect(1).toBe(1); await expectNoA11yViolations(document.body); });\n"
    );
    const green = run();
    assert.equal(green.status, 0, green.stdout);
    assert.match(green.stdout, /1 gated component\(s\) pass/);

    gate(`${app}/Missing.tsx`);
    const missing = run();
    assert.equal(missing.status, 1);
    assert.match(missing.stdout, /matches no component/);

    // Waivers out of path order fail the gate until --sort puts them in place.
    const registry = join(
      root,
      'docs/design-system/component-certification.json'
    );
    writeFileSync(
      registry,
      JSON.stringify({
        gates: { [source]: ['tests', 'a11y'] },
        waivers: {
          'packages/ui/b.tsx': { rtl: 'No text', empty: 'No list' },
          'packages/ui/a.tsx': { offline: 'No network' },
        },
      })
    );
    const unsorted = run();
    assert.equal(unsorted.status, 1, unsorted.stdout);
    assert.match(unsorted.stdout, /waivers is not sorted by component path/);
    assert.match(
      unsorted.stdout,
      /run node scripts\/component-certificate\.mjs --sort/
    );
    const sort = spawnSync(
      process.execPath,
      [cli, '--repo-root', root, '--sort'],
      {
        encoding: 'utf8',
      }
    );
    assert.equal(sort.status, 0, sort.stderr);
    const { waivers } = JSON.parse(readFileSync(registry, 'utf8'));
    assert.deepEqual(Object.keys(waivers), [
      'packages/ui/a.tsx',
      'packages/ui/b.tsx',
    ]);
    // State order inside an entry stays as written.
    assert.deepEqual(Object.keys(waivers['packages/ui/b.tsx']), [
      'rtl',
      'empty',
    ]);
    assert.equal(run().status, 0);
  });
});
