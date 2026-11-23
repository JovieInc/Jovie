import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  compareWithBase,
  gapTouches,
  hasExport,
  parseChatToolIds,
  requiredEntryPoints,
  SCHEMA,
  summarize,
  validateRegistry,
} from './outcome-coverage.mjs';

const files = {
  'app/api/links/route.ts':
    'export async function POST() {}\nexport const PUT = handler;',
  'app/actions.ts': 'export { saveThing };',
  'tests/links.spec.ts': "test('adds a link and reads it back', () => {})",
};
const readFile = file => files[file] ?? null;

const registry = (actions = []) => ({
  schema: SCHEMA,
  actions: [
    {
      id: 'links',
      core: true,
      entryPoints: ['app/api/links/route.ts#POST'],
      chatTools: ['proposeSocialLink'],
      checks: [
        {
          file: 'tests/links.spec.ts',
          test: 'adds a link and reads it back',
          runs: 'prod-postdeploy',
        },
      ],
    },
    {
      id: 'chat-merch',
      core: true,
      entryPoints: [],
      chatTools: ['createMerch'],
      checks: [],
      gap: 'no check yet',
    },
    ...actions,
  ],
});

const context = {
  chatTools: ['proposeSocialLink', 'createMerch'],
  required: ['app/api/links/route.ts#POST'],
  readFile,
};

describe('validateRegistry', () => {
  it('passes a registry that maps every tool and mutation', () => {
    assert.deepEqual(validateRegistry(registry(), context), []);
  });

  it('fails a chat tool with no action (the make-merch hole)', () => {
    const errors = validateRegistry(registry(), {
      ...context,
      chatTools: [...context.chatTools, 'manageTasks'],
    });
    assert.match(errors.join('\n'), /chat tool manageTasks has no action/);
  });

  it('fails a core mutation with no action', () => {
    const errors = validateRegistry(registry(), {
      ...context,
      required: [...context.required, 'app/actions.ts#saveThing'],
    });
    assert.match(errors.join('\n'), /core mutation app\/actions.ts#saveThing/);
  });

  it('fails a tool mapped twice, or one the chat route does not have', () => {
    const errors = validateRegistry(
      registry([
        {
          id: 'chat-extra',
          chatTools: ['createMerch', 'ghostTool'],
          checks: [],
          gap: 'x',
        },
      ]),
      context
    );
    assert.match(errors.join('\n'), /createMerch is mapped twice/);
    assert.match(errors.join('\n'), /ghostTool is not in CHAT_ROUTE_TOOL_IDS/);
  });

  it('fails a check whose test title is not in its file', () => {
    const bad = registry();
    bad.actions[0].checks[0].test = 'renamed test';
    assert.match(
      validateRegistry(bad, context).join('\n'),
      /"renamed test" is not in tests\/links.spec.ts/
    );
  });

  it('fails a missing entry point export, a bad run kind, and a gap with a check', () => {
    const bad = registry();
    bad.actions[0].entryPoints.push('app/api/links/route.ts#DELETE');
    bad.actions[0].checks[0].runs = 'sometimes';
    bad.actions[0].gap = 'stale';
    const text = validateRegistry(bad, context).join('\n');
    assert.match(text, /has no export DELETE handler/);
    assert.match(text, /runs "sometimes"/);
    assert.match(text, /drop its gap reason/);
  });

  it('fails an action with neither a check nor a gap reason', () => {
    const bad = registry();
    delete bad.actions[1].gap;
    assert.match(
      validateRegistry(bad, context).join('\n'),
      /chat-merch: has no outcome check, so it needs a gap reason/
    );
  });
});

describe('compareWithBase (the ratchet)', () => {
  it('skips when the base has no registry', () => {
    assert.deepEqual(compareWithBase(null, registry()), []);
  });

  it('fails a new tool added to an action with no check', () => {
    const head = registry();
    head.actions[1].chatTools.push('previewMerchOptions');
    assert.match(
      compareWithBase(registry(), head).join('\n'),
      /new chat tool previewMerchOptions sits on chat-merch/
    );
  });

  it('fails a new action with no check, and a growing gap list', () => {
    const head = registry([
      { id: 'chat-task', chatTools: [], checks: [], gap: 'later' },
    ]);
    const text = compareWithBase(registry(), head).join('\n');
    assert.match(text, /new action chat-task has no outcome check/);
    assert.match(text, /gap list grew from 1 to 2/);
  });

  it('passes a new tool on an action that has a check, and a shrinking gap list', () => {
    const head = registry();
    head.actions[0].chatTools.push('proposeSocialLinkRemoval');
    head.actions[1].checks = [
      { file: 'tests/links.spec.ts', test: 'x', runs: 'pr' },
    ];
    delete head.actions[1].gap;
    assert.deepEqual(compareWithBase(registry(), head), []);
  });
});

describe('helpers', () => {
  it('parses the chat tool inventory', () => {
    assert.deepEqual(
      parseChatToolIds(
        'export const CHAT_ROUTE_TOOL_IDS = [\n  // c\n  \'a\',\n  "b",\n] as const;'
      ),
      ['a', 'b']
    );
    assert.throws(() => parseChatToolIds('nothing'), /not found/);
  });

  it('lists only non-deferred writes from the launch inventory', () => {
    assert.deepEqual(
      requiredEntryPoints({
        inventory: [
          {
            source: 'a.ts',
            kind: 'handler',
            surface: 'account',
            methods: ['GET', 'OPTIONS', 'POST'],
          },
          {
            source: 'b.ts',
            kind: 'handler',
            surface: 'deferred',
            methods: ['POST'],
          },
          {
            source: 'c.ts',
            kind: 'action',
            surface: 'profile-links',
            export: 'save',
          },
          { source: 'd.tsx', kind: 'page', surface: 'account', methods: [] },
        ],
      }),
      ['a.ts#POST', 'c.ts#save']
    );
  });

  it('recognizes export forms', () => {
    assert.ok(hasExport(files['app/api/links/route.ts'], 'POST'));
    assert.ok(hasExport(files['app/api/links/route.ts'], 'PUT'));
    assert.ok(hasExport(files['app/actions.ts'], 'saveThing'));
    assert.ok(!hasExport(files['app/api/links/route.ts'], 'POS'));
  });

  it('summarizes and warns on changes to gap actions', () => {
    const reg = registry([
      {
        id: 'release-create',
        core: true,
        entryPoints: ['app/actions.ts#saveThing'],
        checks: [],
        gap: 'slice 2',
      },
    ]);
    assert.deepEqual(summarize(reg), {
      actions: 3,
      covered: 1,
      gaps: 2,
      coreGaps: ['chat-merch', 'release-create'],
      chatTools: 2,
      chatToolsChecked: 1,
    });
    assert.deepEqual(gapTouches(reg, ['app/actions.ts', 'other.ts']), [
      'app/actions.ts changed, and release-create still has no outcome check (slice 2)',
    ]);
  });
});
