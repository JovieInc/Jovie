import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, it, vi } from 'vitest';
import { certifyComponent } from '../component-certificate.mjs';
import {
  isRenderInput,
  RENDER_INPUT_SCHEMA,
  storyEvidenceEligibility,
} from '../component-render-inputs.mjs';
import { loadStoryReceipts } from '../component-story-receipts.mjs';

const root = resolve(import.meta.dirname, '../../..');
const binding = {
  schema: RENDER_INPUT_SCHEMA,
  mode: 'storybook-full',
  digest: 'a'.repeat(64),
};
const source = 'export function Card() { return <div />; }';
const sourceHash = createHash('sha256').update(source).digest('hex');
const input = {
  path: 'Card.tsx',
  source,
  testSource:
    'it("axe", async () => { await axe(container); expect(1).toBe(1); });',
};
const status = (criterion, evidence) =>
  certifyComponent({ ...input, evidence }).criteria.find(
    c => c.id === criterion
  ).status;

describe('render evidence freshness at the certificate boundary', () => {
  it('source-only calls need no Git inventory or input snapshot', () => {
    const dir = mkdtempSync(join(tmpdir(), 'no-story-receipts-'));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      assert.deepEqual(loadStoryReceipts(dir, { visual: 'missing.json' }), {
        renderInputs: null,
        visual: {},
        a11y: {},
      });
      assert.equal(errors.mock.calls.length, 0);
    } finally {
      errors.mockRestore();
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('computes component binding from source rather than caller metadata', () => {
    assert.equal(
      certifyComponent({ ...input, evidence: { sourceHash: 'invented' } })
        .binding,
      sourceHash
    );
  });
  it.each(['pass', 'fail'])(
    'stale or legacy %s stays unknown even with independent unit axe',
    observed => {
      for (const renderInputs of [
        undefined,
        { ...binding, digest: 'b'.repeat(64) },
      ])
        for (const id of ['a11y', 'visual'])
          assert.equal(
            status(id, {
              renderInputs: binding,
              [id]: { sourceHash, status: observed, renderInputs },
            }),
            'unknown'
          );
    }
  );
  it('keeps current failures, current passes, and the genuinely absent receipt fallback', () => {
    for (const id of ['a11y', 'visual'])
      for (const observed of ['pass', 'fail'])
        assert.equal(
          status(id, {
            renderInputs: binding,
            [id]: { sourceHash, status: observed, renderInputs: binding },
          }),
          observed
        );
    assert.equal(status('a11y', {}), 'pass');
    assert.equal(status('visual', {}), 'unknown');
    assert.equal(
      status('a11y', {
        a11y: { status: 'pass', sourceHash, renderInputs: binding },
      }),
      'unknown'
    );
  });
});

describe('render input refresh eligibility', () => {
  const workflow = createRequire(import.meta.url)('js-yaml').load(
    readFileSync(join(root, '.github/workflows/visual-a11y.yml'), 'utf8')
  );
  const glob = pattern =>
    new RegExp(
      '^' +
        pattern
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')
          .replace(/\*\*\//g, '\u0001')
          .replace(/\*\*/g, '\u0002')
          .replace(/\*/g, '[^/]*')
          .replace(/\u0001/g, '(?:.*/)?')
          .replace(/\u0002/g, '.*') +
        '$'
    );
  const eligible = path =>
    workflow.on.push.paths.reduce((match, pattern) => {
      const excluded = pattern.startsWith('!');
      return glob(excluded ? pattern.slice(1) : pattern).test(path)
        ? !excluded
        : match;
    }, false);
  it.each([
    ['apps/web/components/Widget.tsx', 'apps/web/lib/Widget.tsx', true],
    ['apps/web/lib/palette.ts', 'apps/web/tests/palette.ts', false],
    [
      'apps/web/tests/fixtures/upgrade-checkout-story.tsx',
      'apps/web/tests/fixtures/upgrade-checkout-story.tsx',
      false,
    ],
    [
      'apps/web/lib/docs/parseMarkdownFrontmatter.ts',
      'apps/web/lib/docs/parseMarkdownFrontmatter.ts',
      false,
    ],
  ])(
    'actual workflow preserves render inputs through an edit or rename from %s to %s',
    (from, to, visual) => {
      const dir = mkdtempSync(join(tmpdir(), 'render-refresh-rename-'));
      const env = Object.fromEntries(
        Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))
      );
      const git = args =>
        execFileSync(
          'git',
          [
            '-c',
            'core.hooksPath=/dev/null',
            '-c',
            'user.name=Fixture',
            '-c',
            'user.email=fixture@example.invalid',
            ...args,
          ],
          { cwd: dir, env, encoding: 'utf8' }
        ).trim();
      const put = (path, text) => {
        mkdirSync(dirname(join(dir, path)), { recursive: true });
        writeFileSync(join(dir, path), text);
      };
      try {
        git(['init', '-q']);
        put(
          'scripts/lib/component-render-inputs.mjs',
          readFileSync(
            join(root, 'scripts/lib/component-render-inputs.mjs'),
            'utf8'
          )
        );
        put(from, 'export const color = "red";');
        git(['add', '.']);
        git(['commit', '-qm', 'before rename']);
        const base = git(['rev-parse', 'HEAD']);
        mkdirSync(dirname(join(dir, to)), { recursive: true });
        if (from === to) put(to, 'export const color = "blue";');
        else renameSync(join(dir, from), join(dir, to));
        put('packages/copy/docs/notes.md', '# Workflow admission');
        git(['add', '-A']);
        git(['commit', '-qm', 'rename render input']);
        for (const BASE_SHA of [base, '0'.repeat(40)]) {
          const output = join(dir, 'outputs');
          writeFileSync(output, '');
          execFileSync(
            'bash',
            [
              '-c',
              workflow.jobs['ci-visual-path-changes'].steps.find(
                step => step.id === 'detect'
              ).run,
            ],
            {
              cwd: dir,
              env: {
                ...env,
                EVENT_NAME: 'push',
                BASE_SHA,
                HEAD_SHA: git(['rev-parse', 'HEAD']),
                GITHUB_OUTPUT: output,
              },
            }
          );
          assert.equal(
            readFileSync(output, 'utf8'),
            `has_visual_changes=${visual}\nhas_render_changes=true\n`
          );
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  );

  it('every current selected input and internal asset target can trigger its refresh', () => {
    const paths = execFileSync('git', ['ls-files', '-z'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    })
      .split('\0')
      .filter(isRenderInput);
    assert.ok(paths.length > 1000);
    for (const path of paths) {
      assert.ok(eligible(path), `no workflow refresh for ${path}`);
      if (lstatSync(join(root, path)).isSymbolicLink()) {
        const target = relative(root, realpathSync(join(root, path)));
        assert.ok(eligible(target), `no asset target refresh for ${target}`);
      }
    }
  });
  it('new shared inputs run the existing producer without extending the old sixteen-shard matrix', () => {
    for (const path of [
      'apps/web/lib/a11y-gates/wcag-22-aa.ts',
      'apps/web/public/new.png',
      'packages/copy/src/index.ts',
      'scripts/lib/component-render-inputs.mjs',
      'apps/web/tests/fixtures/upgrade-checkout-story.tsx',
      'apps/web/tests/fixtures/hud-cockpit.ts',
      'apps/web/tests/fixtures/audio/tone.wav',
      'apps/web/lib/docs/parseMarkdownFrontmatter.ts',
    ]) {
      assert.ok(eligible(path), path);
      assert.deepEqual(storyEvidenceEligibility([path]), {
        render: true,
        visual: false,
      });
    }
    assert.deepEqual(
      storyEvidenceEligibility(['apps/web/app/api/example/route.ts']),
      { render: false, visual: false }
    );
    assert.deepEqual(
      storyEvidenceEligibility(['packages/ui/atoms/button.test.tsx']),
      { render: true, visual: true }
    );
    assert.match(
      workflow.jobs['component-story-evidence'].if,
      /has_render_changes/
    );
    assert.match(workflow.jobs['storybook-a11y'].if, /has_visual_changes/);
  });

  it('retains unit and markdown exclusions after runtime fixture admission', () => {
    for (const path of [
      'apps/web/tests/unit/status.test.ts',
      'apps/web/tests/fixtures/helper.test.ts',
      'apps/web/tests/fixtures/helper.spec.tsx',
      'apps/web/tests/fixtures/__tests__/helper.ts',
      'apps/web/tests/fixtures/README.md',
      'apps/web/lib/docs/parser.spec.ts',
      'apps/web/docs/guide.md',
    ]) {
      assert.equal(isRenderInput(path), false, path);
      assert.equal(eligible(path), false, path);
      assert.deepEqual(storyEvidenceEligibility([path]), {
        render: false,
        visual: false,
      });
    }
  });
});
