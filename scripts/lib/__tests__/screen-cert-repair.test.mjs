import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';
import { certifyComponent } from '../component-certificate.mjs';
import {
  applyRepair,
  insertWaiverBlock,
  renameEmptyExports,
  submitEventOnly,
} from '../screen-cert-repair.mjs';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const COMPONENT = 'apps/web/components/jovie/merch-tool-artifacts.tsx';

function readRepo(rel) {
  return readFileSync(join(repoRoot, rel), 'utf8');
}

function repairFixture() {
  const root = mkdtempSync(join(tmpdir(), 'screen-cert-repair-'));
  for (const rel of [
    COMPONENT,
    COMPONENT.replace('.tsx', '.stories.tsx'),
    COMPONENT.replace('.tsx', '.test.tsx'),
    'docs/design-system/component-certification.json',
    'apps/web/tests/unit/design-system/plain-button-scope.json',
  ]) {
    const dest = join(root, rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, readRepo(rel));
  }
  return root;
}

describe('screen certificate repair', () => {
  it('accepts a headless control only when the existing scope approves its file', () => {
    const root = repairFixture();
    writeFileSync(
      join(root, COMPONENT),
      `${readRepo(COMPONENT)}\nexport function ApprovedAction() { return <PlainButton type='button'>Continue</PlainButton>; }\n`
    );
    writeFileSync(
      join(root, 'apps/web/tests/unit/design-system/plain-button-scope.json'),
      JSON.stringify({ files: [COMPONENT.replace('apps/web/', '')] })
    );
    const result = applyRepair(root, [COMPONENT], { write: true });
    assert.equal(result.ok, true, JSON.stringify(result));
  });

  it.each(['button', 'PlainButton'])(
    'refuses an unapproved %s and writes no companions',
    control => {
      const root = repairFixture();
      writeFileSync(
        join(root, COMPONENT),
        `${readRepo(COMPONENT)}\nexport function RawAction() { return <${control} type='button'>Continue</${control}>; }\n`
      );
      const story = COMPONENT.replace('.tsx', '.stories.tsx');
      const before = readFileSync(join(root, story), 'utf8');
      const result = applyRepair(root, [COMPONENT], { write: true });
      assert.equal(result.ok, false);
      assert.ok(result.missing.includes('ds-owner'));
      assert.equal(readFileSync(join(root, story), 'utf8'), before);
      assert.equal(
        existsSync(
          join(root, COMPONENT.replace('.tsx', '.states.stories.tsx'))
        ),
        false
      );
      assert.equal(
        existsSync(
          join(root, COMPONENT.replace('.tsx', '.certificate.test.tsx'))
        ),
        false
      );
    }
  );

  it('treats a chat submit event as the only mutate signal', () => {
    const source = readRepo(COMPONENT);
    assert.equal(submitEventOnly(source), true);
    assert.equal(submitEventOnly(`${source}\nfetch(url)`), false);
    assert.equal(submitEventOnly('onSubmit={save}'), false);
  });

  it('renames an empty-list story and leaves a populated one', () => {
    const renamed = renameEmptyExports(
      "export const WithoutCandidates = { args: { candidates: [] } };\nexport const NoItems = { args: { candidates: ['a'] } };\n"
    );
    assert.match(renamed, /export const EmptyCandidates/);
    assert.match(renamed, /export const NoItems/);
    assert.equal(
      renameEmptyExports(
        'export const WithoutCandidates = {};',
        new Set(['WithoutCandidates'])
      ),
      'export const WithoutCandidates = {};'
    );
  });

  it('inserts waivers in path order and does not replace a different reason', () => {
    const tiny =
      '{\n  "waivers": {\n    "apps/web/components/jovie/source-evidence-context.tsx": {\n      "empty": "kept"\n    }\n  }\n}\n';
    const once = insertWaiverBlock(tiny, COMPONENT, {
      error: 'detector matched submit',
      offline: 'never fetches',
    });
    const parsed = JSON.parse(once);
    const keys = Object.keys(parsed.waivers);
    assert.ok(
      keys.indexOf(COMPONENT) <
        keys.indexOf('apps/web/components/jovie/source-evidence-context.tsx')
    );
    assert.equal(
      insertWaiverBlock(once, COMPONENT, { error: 'other', offline: 'other' }),
      once
    );

    const custom = insertWaiverBlock(tiny, COMPONENT, {
      error: 'already written',
    });
    const kept = insertWaiverBlock(custom, COMPONENT, {
      error: 'detector matched submit',
      offline: 'never fetches',
    });
    assert.equal(JSON.parse(kept).waivers[COMPONENT].error, 'already written');
    assert.equal(JSON.parse(kept).waivers[COMPONENT].offline, 'never fetches');
  });

  it('places the merch waiver before source-evidence in the real map', () => {
    const real = readRepo('docs/design-system/component-certification.json');
    const next = insertWaiverBlock(real, COMPONENT, {
      error: 'detector matched submit',
      offline: 'never fetches',
    });
    const parsed = JSON.parse(next);
    const keys = Object.keys(parsed.waivers);
    const at = keys.indexOf(COMPONENT);
    assert.ok(
      at > keys.indexOf('apps/web/components/jovie/components/ErrorDisplay.tsx')
    );
    assert.ok(
      at < keys.indexOf('apps/web/components/jovie/source-evidence-context.tsx')
    );
    assert.equal(
      insertWaiverBlock(next, COMPONENT, { error: 'x', offline: 'y' }),
      next
    );
  });

  it('generates the provable states and an axe test for the merch card', () => {
    const root = mkdtempSync(join(tmpdir(), 'screen-cert-repair-'));
    const rels = [
      COMPONENT,
      'apps/web/components/jovie/merch-tool-artifacts.stories.tsx',
      'apps/web/components/jovie/merch-tool-artifacts.test.tsx',
    ];
    for (const rel of rels) {
      const dest = join(root, rel);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, readRepo(rel));
    }
    const waiverPath = join(
      root,
      'docs/design-system/component-certification.json'
    );
    mkdirSync(dirname(waiverPath), { recursive: true });
    writeFileSync(
      waiverPath,
      '{\n  "waivers": {\n    "apps/web/components/jovie/source-evidence-context.tsx": {\n      "empty": "kept"\n    }\n  }\n}\n'
    );
    const first = applyRepair(root, [COMPONENT], { write: true });
    assert.equal(first.ok, true, JSON.stringify(first));
    assert.ok(
      first.changed.includes(
        'apps/web/components/jovie/merch-tool-artifacts.states.stories.tsx'
      )
    );
    assert.ok(
      first.changed.includes(
        'apps/web/components/jovie/merch-tool-artifacts.certificate.test.tsx'
      )
    );
    const stories = readFileSync(
      join(root, 'apps/web/components/jovie/merch-tool-artifacts.stories.tsx'),
      'utf8'
    );
    const states = readFileSync(
      join(
        root,
        'apps/web/components/jovie/merch-tool-artifacts.states.stories.tsx'
      ),
      'utf8'
    );
    const test = readFileSync(
      join(
        root,
        'apps/web/components/jovie/merch-tool-artifacts.certificate.test.tsx'
      ),
      'utf8'
    );
    assert.match(stories, /export const EmptyCandidates/);
    assert.match(states, /export const PartialOptionalMessage/);
    assert.match(states, /export const LongContent/);
    assert.match(states, /export const RtlArabicPhrase/);
    assert.match(states, /dir='rtl'/);
    assert.match(test, /expectNoA11yViolations/);
    assert.match(test, /Jovie could not find a confirmed catalog title/);
    const certificate = certifyComponent({
      path: COMPONENT,
      source: readRepo(COMPONENT),
      storySource: `${stories}\n${states}`,
      testSource: `${readRepo('apps/web/components/jovie/merch-tool-artifacts.test.tsx')}\n${test}`,
      waivers: JSON.parse(readFileSync(waiverPath, 'utf8')).waivers[COMPONENT],
    });
    const status = id =>
      certificate.criteria.find(item => item.id === id)?.status;
    assert.equal(status('states'), 'pass');
    assert.equal(status('a11y'), 'pass');
    const second = applyRepair(root, [COMPONENT], { write: true });
    assert.deepEqual(second, { ok: true, changed: [] });
  });
});
