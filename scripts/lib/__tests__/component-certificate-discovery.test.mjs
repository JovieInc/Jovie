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
import { describe, it } from 'vitest';
import { CRITERIA, certifyComponent } from '../component-certificate.mjs';

const criterion = (cert, id) => cert.criteria.find(row => row.id === id);
const sourceGuardIds = ['ds-owner', 'tokens', 'frontend-rules'];
const clean = 'export function Card() { return <div />; }\n';
const cli = fileURLToPath(
  new URL('../../component-certificate.mjs', import.meta.url)
);

function fixtureReport(root, args, trace = false) {
  const output = join(root, 'report.json');
  const reads = join(root, 'directory-reads.jsonl');
  const preload = `import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const original = fs.readdirSync;
fs.readdirSync = (...args) => {
  if (args[1]?.withFileTypes) fs.appendFileSync(process.env.CERT_DIRECTORY_READS, JSON.stringify(String(args[0])) + '\\n');
  return original(...args);
};
syncBuiltinESMExports();`;
  const result = spawnSync(
    process.execPath,
    [
      ...(trace
        ? ['--import', `data:text/javascript,${encodeURIComponent(preload)}`]
        : []),
      cli,
      '--repo-root',
      root,
      ...args,
      '--out',
      output,
    ],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, CERT_DIRECTORY_READS: reads },
    }
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return JSON.parse(readFileSync(output, 'utf8'));
}

describe('component certificate discovery and source reuse', () => {
  it('all source guards inspect current bytes when a path is certified repeatedly', () => {
    const path = 'apps/web/components/molecules/Card.tsx';
    const inspect = source => certifyComponent({ path, source });
    const failingSource =
      'export const Card = () => <button className="bg-blue-500" autoFocus />;';
    const failing = inspect(failingSource);
    for (const id of sourceGuardIds) {
      assert.equal(criterion(failing, id).status, 'fail');
      assert.ok(failing.missing.some(row => row.criterion === id));
    }
    assert.equal(failing.certified, false);
    assert.deepEqual(criterion(failing, 'tokens').samples, [
      { kind: 'tailwind-palette', value: 'bg-blue-500' },
    ]);
    assert.deepEqual(criterion(failing, 'frontend-rules').findings, [
      {
        rule: 'focus-loss:autofocus',
        line: 1,
        detail:
          'autoFocus steals focus on mount; move focus on an explicit user action',
      },
    ]);
    const passing = inspect(clean);
    for (const id of sourceGuardIds) {
      assert.equal(criterion(passing, id).status, 'pass');
      assert.ok(!passing.missing.some(row => row.criterion === id));
    }
    assert.notEqual(passing.binding, failing.binding);
    assert.deepEqual(inspect(failingSource), failing);
  });

  it('whole-tree discovery retains every coverage root once and its canonical order', () => {
    const root = mkdtempSync(join(tmpdir(), 'component-cert-discovery-'));
    try {
      const component = 'apps/web/components/molecules/Card.tsx';
      const components = [
        'packages/ui/atoms/Primitive.tsx',
        'packages/ui/Surface.tsx',
        'apps/web/components/atoms/Badge.tsx',
        component,
        'apps/web/components/features/Feature.tsx',
      ];
      for (const path of [
        ...components,
        'packages/ui/hooks/NotATopLevelComponent.tsx',
      ]) {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), clean);
      }
      const output = join(root, 'all.json');
      const cli = fileURLToPath(
        new URL('../../component-certificate.mjs', import.meta.url)
      );
      const result = spawnSync(
        process.execPath,
        [
          cli,
          '--repo-root',
          root,
          '--all',
          '--component',
          component,
          '--component',
          component,
          '--out',
          output,
        ],
        { cwd: root, encoding: 'utf8' }
      );
      assert.equal(result.status, 0, result.stdout + result.stderr);
      const report = JSON.parse(readFileSync(output, 'utf8'));
      assert.deepEqual(
        report.certificates.map(c => c.component),
        components
      );
      assert.equal(report.totals.components, components.length);
      for (const cert of report.certificates)
        assert.deepEqual(
          cert.criteria.map(row => row.id),
          CRITERIA
        );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('scoped discovery matches whole-tree mixed-case and companion evidence without changing scope', () => {
    const root = mkdtempSync(join(tmpdir(), 'component-cert-scoped-'));
    try {
      const atoms = 'packages/ui/atoms';
      const card = `${atoms}/card.tsx`;
      const note = `${atoms}/note.tsx`;
      const orphan = `${atoms}/orphan.tsx`;
      const textual =
        'export function Card({ children }) { return <div>{children}</div>; }';
      const cases = [
        [card, textual],
        [
          `${atoms}/Card.stories.tsx`,
          'export const Default = {}; export const LongContent = {}; export const Rtl = {};',
        ],
        [
          `${atoms}/Card.spec.tsx`,
          "it('axe', () => { expectNoA11yViolations(document.body); expect(1).toBe(1); });",
        ],
        [note, textual],
        [`${atoms}/Note.stories.tsx`, 'export const Default = {};'],
        [
          `${atoms}/Note.states.stories.tsx`,
          'export const LongContent = {}; export const Rtl = {};',
        ],
        [
          `${atoms}/Note.test.tsx`,
          "it('renders', () => { expect(1).toBe(1); });",
        ],
        [
          `${atoms}/Note.certificate.test.tsx`,
          'expectNoA11yViolations(document.body);',
        ],
        [orphan, textual],
        [
          `${atoms}/orphanage.stories.tsx`,
          'export const Default = {}; export const LongContent = {}; export const Rtl = {};',
        ],
        [
          `${atoms}/orphan.states.stories.tsx`,
          'export const LongContent = {}; export const Rtl = {};',
        ],
        [`${atoms}/unrequested/Child.tsx`, clean],
        ['apps/web/components/atoms/Other.tsx', clean],
      ];
      for (const [path, text] of cases) {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), text);
      }
      const all = fixtureReport(root, ['--all']);
      assert.equal(all.totals.components, 5);
      const requested = [note, card, orphan, note];
      const scoped = fixtureReport(
        root,
        requested.flatMap(path => ['--component', path]),
        true
      );
      assert.equal(criterion(scoped.certificates[1], 'states').status, 'pass');
      for (const cert of scoped.certificates) {
        assert.deepEqual(
          cert,
          all.certificates.find(c => c.component === cert.component)
        );
        assert.deepEqual(
          cert.criteria.map(row => row.id),
          CRITERIA
        );
      }
      assert.deepEqual(
        scoped.certificates.map(c => c.component),
        [note, card, orphan]
      );
      assert.equal(scoped.totals.components, 3);
      for (const cert of scoped.certificates.slice(0, 2)) {
        for (const id of ['states', 'tests', 'a11y', 'ds-owner'])
          assert.equal(
            criterion(cert, id).status,
            'pass',
            `${cert.component}: ${id}`
          );
      }
      assert.equal(criterion(scoped.certificates[2], 'states').status, 'fail');
      assert.equal(
        criterion(scoped.certificates[2], 'states').detail,
        'no story file'
      );
      assert.equal(criterion(scoped.certificates[2], 'tests').status, 'fail');
      const walked = readFileSync(join(root, 'directory-reads.jsonl'), 'utf8')
        .trim()
        .split('\n')
        .map(line => JSON.parse(line));
      assert.deepEqual(walked, [join(root, atoms)]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('retains explicit app-route, excluded and missing rows and exact gate behavior', () => {
    const root = mkdtempSync(join(tmpdir(), 'component-cert-explicit-'));
    try {
      const dir = 'apps/web/app/[slug]/_components';
      const component = `${dir}/banner.tsx`;
      const missing = `${dir}/missing.tsx`;
      const excluded = 'packages/ui/atoms/index.tsx';
      for (const [path, text] of [
        [
          component,
          'export function Banner({ children }) { return <button>{children}</button>; }',
        ],
        [
          `${dir}/Banner.test.tsx`,
          "it('clicks', () => { user.click(document.body); expect(1).toBe(1); });",
        ],
        [
          `${dir}/Banner.stories.tsx`,
          'export const Default = {}; export const LongContent = {}; export const Rtl = {};',
        ],
        [excluded, clean],
        [
          'packages/ui/atoms/index.test.tsx',
          "it('renders', () => { expect(1).toBe(1); });",
        ],
      ]) {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), text);
      }
      const scoped = fixtureReport(
        root,
        [missing, component, excluded, component].flatMap(path => [
          '--component',
          path,
        ])
      );
      assert.deepEqual(
        scoped.certificates.map(c => c.component),
        [missing, component, excluded]
      );
      assert.equal(scoped.totals.components, 3);
      assert.equal(criterion(scoped.certificates[0], 'tests').status, 'fail');
      assert.equal(scoped.certificates[0].certified, false);
      assert.equal(criterion(scoped.certificates[1], 'states').status, 'pass');
      assert.equal(criterion(scoped.certificates[1], 'tests').status, 'pass');
      assert.equal(
        criterion(scoped.certificates[1], 'ds-owner').status,
        'fail'
      );
      assert.equal(criterion(scoped.certificates[2], 'tests').status, 'pass');
      mkdirSync(join(root, 'docs/design-system'), { recursive: true });
      writeFileSync(
        join(root, 'docs/design-system/component-certification.json'),
        JSON.stringify({ gates: { [component]: ['tests', 'states'] } })
      );
      const gate = spawnSync(
        process.execPath,
        [cli, '--repo-root', root, '--gate'],
        { encoding: 'utf8' }
      );
      assert.equal(gate.status, 0, gate.stdout + gate.stderr);
      assert.match(gate.stdout, /1 gated component\(s\) pass/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
