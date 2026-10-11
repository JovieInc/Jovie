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
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildDriftLedger,
  checkDriftLedger,
  LEDGER_JSON,
  LEDGER_MD,
  MD_END,
  MD_START,
  SIGNALS,
  updateDriftLedger,
} from './design-drift-ledger.mjs';

const SCRIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'design-drift-ledger.mjs'
);

const count = (key, source) =>
  (source.match(new RegExp(SIGNALS[key].source, SIGNALS[key].flags)) ?? [])
    .length;

function write(root, relative, content) {
  const file = path.join(root, relative);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

/** Tiny repo: one route -> feature (relative) -> nested feature (@/ alias). */
function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'design-drift-ledger-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const web = 'apps/web';
  write(
    root,
    `${web}/app/app/(shell)/chat/page.tsx`,
    "import { Panel } from '@/features/chat/Panel';\nexport default Panel;\n"
  );
  write(
    root,
    `${web}/app/app/(shell)/(group)/tasks/[id]/page.tsx`,
    "import '../../../../../../components/jovie/Board';\n"
  );
  write(
    root,
    `${web}/components/features/chat/Panel.tsx`,
    "import { Deep } from './deep';\nimport { Atom } from '@/atoms/Atom';\n" +
      "export const Panel = () => <button className='text-amber-700 w-[327px]'>x</button>;\n"
  );
  write(
    root,
    `${web}/components/features/chat/deep/index.tsx`,
    "export const Deep = () => <div className='h-11 text-error bg-[var(--linear-bg)]' />;\n"
  );
  write(
    root,
    `${web}/components/atoms/Atom.tsx`,
    "export const Atom = () => <button className='bg-white' />;\n"
  );
  write(
    root,
    `${web}/components/jovie/Board.tsx`,
    "export const Board = () => <div className='text-destructive' />;\n"
  );
  write(
    root,
    `${web}/components/features/unused/Orphan.tsx`,
    "export const Orphan = () => <button className='text-red-500' />;\n"
  );
  write(
    root,
    `${web}/components/shell/StatusBadge.tsx`,
    'export const StatusBadge = 1;\n'
  );
  write(
    root,
    `${web}/data/appScreens/registry.ts`,
    'type T = { readonly penRootId: string | null };\nconst a = { penRootId: null };\nconst b = { penRootId: "abc" };\n'
  );
  write(
    root,
    `${web}/data/designSystem/componentRegistry.ts`,
    'const c = { penRootId: null };\n'
  );
  write(
    root,
    LEDGER_MD,
    `# Ledger\n\nIntro.\n\n${MD_START}\n${MD_END}\n\nTail.\n`
  );
  return root;
}

const run = (root, flag) =>
  spawnSync(process.execPath, [SCRIPT, flag, '--root', root], {
    encoding: 'utf8',
  });

test('each signal regex matches its drift and skips canonical forms', () => {
  assert.equal(count('rawPalette', "text-amber-700 bg-white '#ff00aa'"), 3);
  assert.equal(count('rawPalette', 'text-primary bg-surface-1 &#123;'), 0);
  assert.equal(count('arbitrary', 'w-[327px] leading-[18px] w-4'), 2);
  assert.equal(
    count('rawButton', '<button type="button"><Button/><button>'),
    2
  );
  assert.equal(count('linearToken', 'var(--linear-bg) var(--color-bg)'), 1);
  assert.equal(
    count('oversizeControl', 'h-11 size-12 md:h-12 min-h-11 h-110'),
    3
  );
  assert.equal(
    count(
      'dangerAlias',
      'text-error bg-destructive border-red-500 text-errors'
    ),
    3
  );
});

test('import graph is transitive across relative and @/ alias imports', t => {
  const ledger = buildDriftLedger({ repoRoot: fixture(t) });
  assert.deepEqual(Object.keys(ledger.routes), [
    '/app/chat',
    '/app/tasks/[id]',
  ]);
  const chat = ledger.routes['/app/chat'];
  // page + Panel + deep/index (route-owned); Atom is a shared layer.
  assert.equal(chat.files, 3);
  assert.equal(chat.rawButton, 1);
  assert.equal(chat.oversizeControl, 1, 'reached through ./deep index');
  assert.equal(chat.linearToken, 1);
  assert.equal(chat.dangerAlias, 1);
  assert.equal(ledger.routes['/app/tasks/[id]'].dangerAlias, 1);
  // Orphan is unreachable, so its raw button never counts.
  assert.equal(ledger.aggregate.rawButton, 1);
  assert.equal(ledger.sharedLayers.rawButton, 1);
  assert.equal(ledger.sharedLayers.rawPalette, 1);
  assert.equal(ledger.aggregate.penRootIdNull, 2);
  assert.deepEqual(ledger.registries.appScreens, {
    entries: 2,
    penRootIdNull: 1,
  });
  assert.equal(ledger.aggregate.statusFamily, 1);
});

test('--update round-trips: JSON + markdown rewritten, --check passes', t => {
  const root = fixture(t);
  const updated = run(root, '--update');
  assert.equal(updated.status, 0, updated.stderr);
  const markdown = readFileSync(path.join(root, LEDGER_MD), 'utf8');
  assert.match(markdown, /^# Ledger\n\nIntro\./);
  assert.match(markdown, /\| `\/app\/chat` \| 3 \|/);
  assert.match(markdown, /Tail\.\n$/);
  const json = JSON.parse(readFileSync(path.join(root, LEDGER_JSON), 'utf8'));
  assert.equal(json.aggregate.rawButton, 1);
  const checked = run(root, '--check');
  assert.equal(checked.status, 0, checked.stderr);
  // A second update is byte-identical (stable key order, sorted routes).
  run(root, '--update');
  assert.equal(readFileSync(path.join(root, LEDGER_MD), 'utf8'), markdown);
});

test('--check fails when an aggregate count grows', t => {
  const root = fixture(t);
  updateDriftLedger({ repoRoot: root });
  write(
    root,
    'apps/web/components/features/chat/deep/index.tsx',
    "export const Deep = () => <><button /><div className='h-11 text-error bg-[var(--linear-bg)]' /></>;\n"
  );
  const result = checkDriftLedger({ repoRoot: root });
  assert.equal(result.ok, false);
  assert.match(
    result.issues.join('\n'),
    /aggregate\.rawButton grew to 2 \(ledger 1\)/
  );
  assert.equal(run(root, '--check').status, 1);
});

test('--check passes on shrink and reports it', t => {
  const root = fixture(t);
  updateDriftLedger({ repoRoot: root });
  write(
    root,
    'apps/web/components/jovie/Board.tsx',
    'export const Board = 1;\n'
  );
  const result = checkDriftLedger({ repoRoot: root });
  assert.equal(result.ok, true);
  assert.match(result.shrunk.join(), /aggregate\.dangerAlias 2 -> 1/);
});

test('--check fails when the markdown block is stale', t => {
  const root = fixture(t);
  updateDriftLedger({ repoRoot: root });
  const mdPath = path.join(root, LEDGER_MD);
  writeFileSync(
    mdPath,
    readFileSync(mdPath, 'utf8').replace(
      '| `/app/chat` | 3 |',
      '| `/app/chat` | 9 |'
    )
  );
  const result = checkDriftLedger({ repoRoot: root });
  assert.equal(result.ok, false);
  assert.match(result.issues.join(), /table is stale/);
});

test('--check exits 2 on unreadable inputs', t => {
  const root = fixture(t);
  assert.throws(
    () => checkDriftLedger({ repoRoot: root }),
    /drift-ledger\.json is missing/
  );
  assert.equal(run(root, '--check').status, 2);
});
