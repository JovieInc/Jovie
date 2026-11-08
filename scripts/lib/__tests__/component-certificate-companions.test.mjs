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
});
