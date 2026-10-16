import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  assertCurrentCohort,
  criticalPreimagesMatch,
  fetchBacklogSweepCandidates,
  readBacklogCurrent,
} from '../backlog-current-linear.mjs';

const id = number =>
  `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const VERSION = '2026-10-16T20:00:00.000Z';
const clone = value => structuredClone(value);
const connection = nodes => ({ nodes, pageInfo: { hasNextPage: false } });
const person = number => ({ id: id(number), name: `Owner ${number}` });
function row(number = 1) {
  return {
    id: id(number),
    identifier: `JOV-${6640 + number}`,
    title: `Issue ${number} 音楽 🎹`,
    description: 'Scope: useful work\nAcceptance: vérifié',
    createdAt: '2026-10-15T12:00:00Z',
    updatedAt: VERSION,
    priority: 1,
    archivedAt: null,
    state: {
      name: number === 1 ? 'Backlog' : 'Done',
      type: number === 1 ? 'backlog' : 'completed',
    },
    assignee: null,
    delegate: null,
    parent: null,
    labels: connection([
      { id: id(10), name: 'agent-ready' },
      { id: id(11), name: 'P0' },
    ]),
    comments: connection([
      {
        id: id(20),
        body: 'Existing evidence é 🌍',
        createdAt: VERSION,
        user: person(30),
      },
    ]),
    attachments: connection([
      {
        id: id(40),
        title: 'Source',
        url: 'https://github.com/JovieInc/Jovie/pull/19037',
      },
    ]),
    children: connection([]),
    relations: connection(
      number === 1
        ? [
            {
              id: id(50),
              type: 'blocked_by',
              relatedIssue: { id: id(2), identifier: 'JOV-6642' },
            },
          ]
        : []
    ),
    inverseRelations: connection(
      number === 2
        ? [
            {
              id: id(51),
              type: 'blocks',
              issue: { id: id(1), identifier: 'JOV-6641' },
            },
          ]
        : []
    ),
  };
}
const expected = () => ({ [id(1)]: row(1), [id(2)]: row(2) });
const evidence = (rows = expected()) => ({
  linearPreimages: rows,
  linearPreimagesObservedAt: 1_792_180_800,
});
function fixture(rows = expected()) {
  const calls = [];
  return {
    calls,
    client: {
      async graphql(query, variables, options) {
        calls.push({ query, variables, options });
        return Object.fromEntries(
          Object.values(variables).map((identity, index) => [
            `issue${index}`,
            clone(rows[identity]),
          ])
        );
      },
    },
  };
}
const held = code => error =>
  error.code === code &&
  error.effect === 'unknown' &&
  error.authorizesTransition === false &&
  error.authorizesDispatch === false;

test('one query reads exactly the retained UUIDs and six complete connections using the bounded live options', async () => {
  const f = fixture(),
    original = evidence();
  const signal = new AbortController().signal;
  const options = {
    timeoutMs: 4_000,
    maxAttempts: 1,
    rateLimitMaxAttempts: 1,
    signal,
  };
  const actual = await readBacklogCurrent(f.client, original, options);
  assert.equal(f.calls.length, 1);
  const { query, variables, options: passed } = f.calls[0];
  assert.equal(passed, options);
  assert.deepEqual(variables, { id0: id(1), id1: id(2) });
  assert.match(query, /^query\(\$id0:String!,\$id1:String!\)/);
  assert.match(query, /issue0:issue\(id:\$id0\)/);
  assert.match(query, /issue1:issue\(id:\$id1\)/);
  for (const name of [
    'labels',
    'comments',
    'attachments',
    'children',
    'relations',
    'inverseRelations',
  ])
    assert.equal(
      query.match(new RegExp(`${name}\\(first:100\\)`, 'g')).length,
      2
    );
  assert.match(
    query,
    /comments\(first:100\)\{nodes\{id body createdAt user\{id name\}\} pageInfo\{hasNextPage\}\}/
  );
  assert.match(
    query,
    /inverseRelations\(first:100\)\{nodes\{id type issue\{id identifier\}\} pageInfo\{hasNextPage\}\}/
  );
  assert.match(
    query,
    /archivedAt state\{name type\} assignee\{id name\} delegate\{id name\} parent\{id identifier\}/
  );
  assert.doesNotMatch(query, /mutation|after:|issue2:|provider|dispatch/i);
  assert.deepEqual(actual, original.linearPreimages);
  assert.equal(original.linearPreimagesObservedAt, 1_792_180_800);
  assert.equal(criticalPreimagesMatch(actual, original.linearPreimages), true);
});

test('unchanged updatedAt cannot hide comment, owner, dependency, delegate, archive, attachment or structural drift', () => {
  const changes = [
    rows => {
      rows[id(1)].comments.nodes.push({
        id: id(21),
        body: 'Accepted by existing worker',
        createdAt: VERSION,
        user: person(31),
      });
    },
    rows => {
      rows[id(1)].comments.nodes[0].body = 'New execution hold';
    },
    rows => {
      rows[id(1)].comments.nodes[0].user = person(32);
    },
    rows => {
      rows[id(2)].state = { name: 'Backlog', type: 'backlog' };
    },
    rows => {
      rows[id(2)].comments.nodes[0].body = 'Acceptance withdrawn';
    },
    rows => {
      rows[id(1)].assignee = person(33);
    },
    rows => {
      rows[id(1)].delegate = person(34);
    },
    rows => {
      rows[id(1)].archivedAt = VERSION;
    },
    rows => {
      rows[id(1)].attachments.nodes[0].url += '/files';
    },
    rows => {
      rows[id(1)].relations.nodes[0].type = 'blocks';
    },
    rows => {
      rows[id(2)].inverseRelations.nodes[0].issue = {
        id: id(3),
        identifier: 'JOV-6643',
      };
    },
    rows => {
      rows[id(1)].parent = { id: id(3), identifier: 'JOV-6643' };
    },
    rows => {
      rows[id(1)].children.nodes.push({
        id: id(3),
        identifier: 'JOV-6643',
        state: { name: 'Todo', type: 'unstarted' },
      });
    },
    rows => {
      rows[id(1)].labels.nodes[0].name = 'blocked';
    },
    rows => {
      rows[id(1)].priority = 2;
    },
    rows => {
      rows[id(1)].description = null;
    },
    rows => {
      rows[id(1)].title += ' changed';
    },
    rows => {
      rows[id(1)].createdAt = VERSION;
    },
  ];
  for (const change of changes) {
    const before = expected(),
      actual = clone(before);
    change(actual);
    assert.equal(actual[id(1)].updatedAt, before[id(1)].updatedAt);
    assert.equal(criticalPreimagesMatch(actual, before), false);
  }
});

test('node order, JSON object order and Unicode serialization do not fabricate a changed preimage', () => {
  const before = expected();
  before[id(1)].comments.nodes.push({
    id: id(22),
    body: '𝄞 café \u2028 \\u4e50',
    createdAt: VERSION,
    user: null,
  });
  const actual = Object.fromEntries(
    Object.entries(clone(before))
      .reverse()
      .map(([key, value]) => [
        key,
        Object.fromEntries(Object.entries(value).reverse()),
      ])
  );
  actual[id(1)].labels.nodes.reverse();
  actual[id(1)].comments.nodes.reverse();
  assert.equal(criticalPreimagesMatch(actual, before), true);
  actual[id(1)].comments.nodes[0].body = '𝄞 cafe\u0301 \u2028 \\u4e50';
  assert.equal(criticalPreimagesMatch(actual, before), false);
});

test('postwrite permits only selected Backlog to Todo and a nondecreasing version, preserving all dependencies and metadata', () => {
  const before = expected(),
    actual = clone(before);
  actual[id(1)].state = { name: 'Todo', type: 'unstarted' };
  actual[id(1)].updatedAt = '2026-10-16T20:00:01.000Z';
  assert.equal(criticalPreimagesMatch(actual, before), false);
  assert.equal(
    criticalPreimagesMatch(actual, before, { transitionedIssueId: id(1) }),
    true
  );
  assert.equal(before[id(1)].state.name, 'Backlog');
  assert.equal(actual[id(1)].state.name, 'Todo');
  for (const change of [
    rows => {
      rows[id(1)].updatedAt = '2026-10-16T19:59:59.000Z';
    },
    rows => {
      rows[id(1)].state.type = 'started';
    },
    rows => {
      rows[id(1)].state.name = 'In Progress';
    },
    rows => {
      rows[id(1)].comments.nodes[0].body = 'Accepted custody during write';
    },
    rows => {
      rows[id(1)].delegate = person(35);
    },
    rows => {
      rows[id(2)].priority = 2;
    },
    rows => {
      rows[id(2)].updatedAt = '2026-10-16T20:00:01.000Z';
    },
  ]) {
    const changed = clone(actual);
    change(changed);
    assert.equal(
      criticalPreimagesMatch(changed, before, { transitionedIssueId: id(1) }),
      false
    );
  }
  const notBacklog = clone(before);
  notBacklog[id(1)].state = { name: 'Triage', type: 'triage' };
  assert.equal(
    criticalPreimagesMatch(actual, notBacklog, { transitionedIssueId: id(1) }),
    false
  );
  assert.throws(
    () =>
      criticalPreimagesMatch(actual, before, { transitionedIssueId: id(99) }),
    held('backlog-current-transition-identity-invalid')
  );
});

test('incomplete, oversized or malformed connections never receive a partial comparison', async () => {
  const variants = [
    rows => {
      rows[id(1)].comments.pageInfo.hasNextPage = true;
    },
    rows => {
      rows[id(1)].relations.pageInfo = {};
    },
    rows => {
      rows[id(1)].inverseRelations.pageInfo.hasNextPage = 'false';
    },
    rows => {
      rows[id(1)].labels.nodes = null;
    },
    rows => {
      rows[id(1)].children.nodes = [null];
    },
    rows => {
      rows[id(1)].attachments.nodes[0].id = 'bad';
    },
    rows => {
      rows[id(1)].comments.nodes[0].createdAt = 'today';
    },
    rows => {
      rows[id(1)].comments.nodes[0].user = {};
    },
    rows => {
      rows[id(1)].relations.nodes[0].relatedIssue = null;
    },
    rows => {
      rows[id(2)].inverseRelations.nodes[0].issue.identifier = null;
    },
    rows => {
      rows[id(1)].children.nodes.push({
        id: id(3),
        identifier: 'JOV-6643',
        state: null,
      });
    },
    rows => {
      rows[id(1)].labels.nodes.push(clone(rows[id(1)].labels.nodes[0]));
    },
    rows => {
      rows[id(1)].labels.nodes = Array.from(
        { length: 101 },
        (_value, index) => ({ id: id(100 + index), name: 'P0' })
      );
    },
    rows => {
      rows[id(1)].attachments.nodes[0].privateInput = 'unexpected';
    },
  ];
  for (const change of variants) {
    const actual = expected();
    change(actual);
    const f = fixture(actual);
    await assert.rejects(
      readBacklogCurrent(f.client, evidence()),
      error => error.effect === 'unknown'
    );
    assert.throws(
      () => criticalPreimagesMatch(actual, expected()),
      error => error.effect === 'unknown'
    );
    assert.equal(f.calls.length, 1);
  }
});

test('wrong, duplicate, extra and missing current identities fail before any usable rows are returned', async () => {
  for (const response of [
    {},
    { issue0: row(1) },
    { issue0: row(1), issue1: row(2), issue2: row(3) },
    { issue0: row(1), issue1: null },
    { issue0: row(2), issue1: row(1) },
    { issue0: row(1), issue1: row(1) },
    { data: { issue0: row(1), issue1: row(2) } },
    { issue0: row(1), issue1: { ...row(2), identifier: 'LYB-6642' } },
  ])
    await assert.rejects(
      readBacklogCurrent({ graphql: async () => response }, evidence()),
      error => error.effect === 'unknown'
    );
  assert.throws(
    () => criticalPreimagesMatch({ [id(1)]: row(1) }, expected()),
    held('backlog-current-identity-set-changed')
  );
  assert.throws(
    () =>
      criticalPreimagesMatch({ ...expected(), [id(3)]: row(3) }, expected()),
    held('backlog-current-identity-set-changed')
  );
});

test('invalid native evidence and more than eight retained UUIDs never spend a query', async () => {
  const duplicate = expected();
  duplicate[id(2)].identifier = duplicate[id(1)].identifier;
  const variants = [
    null,
    {},
    { linearPreimages: expected() },
    { ...evidence(), linearPreimagesObservedAt: NaN },
    evidence(null),
    evidence({}),
    evidence([]),
    evidence({ bad: row(1) }),
    evidence(duplicate),
    evidence(
      Object.fromEntries(
        Array.from({ length: 9 }, (_value, index) => [
          id(index + 1),
          row(index + 1),
        ])
      )
    ),
  ];
  let calls = 0;
  for (const value of variants)
    await assert.rejects(
      readBacklogCurrent(
        {
          graphql() {
            calls++;
          },
        },
        value
      ),
      error => error.effect === 'unknown'
    );
  assert.equal(calls, 0);
  await assert.rejects(
    readBacklogCurrent({}, evidence()),
    held('backlog-current-client-unavailable')
  );
});

test('malformed CORE fields cannot become equal or a valid postwrite state', () => {
  const variants = [
    { id: id(3) },
    { identifier: null },
    { title: null },
    { description: 1 },
    { createdAt: 'yesterday' },
    { updatedAt: null },
    { priority: '1' },
    { priority: 5 },
    { archivedAt: 'unknown' },
    { state: { name: '', type: 'backlog' } },
    { assignee: { id: id(30) } },
    { delegate: { id: 'bad', name: 'owner' } },
    { parent: { id: id(3), identifier: 'bad' } },
    { fabricated: true },
  ];
  for (const variant of variants) {
    const actual = expected();
    Object.assign(actual[id(1)], variant);
    assert.throws(
      () => criticalPreimagesMatch(actual, expected()),
      held('backlog-current-row-malformed')
    );
  }
});

test('exact eight-UUID boundary is one query; query failures are never retried', async () => {
  const rows = Object.fromEntries(
    Array.from({ length: 8 }, (_value, index) => [
      id(index + 1),
      row(index + 1),
    ])
  );
  const f = fixture(rows);
  assert.equal(
    Object.keys(await readBacklogCurrent(f.client, evidence(rows))).length,
    8
  );
  assert.equal(f.calls.length, 1);
  assert.equal(Object.keys(f.calls[0].variables).length, 8);
  let calls = 0;
  const failure = Error('bounded-query-failure');
  await assert.rejects(
    readBacklogCurrent(
      {
        async graphql() {
          calls++;
          throw failure;
        },
      },
      evidence()
    ),
    error => error === failure
  );
  assert.equal(calls, 1);
});

function metadata(number) {
  const complete = row(number);
  const value = Object.fromEntries(
    Object.entries(complete).filter(
      ([key]) =>
        ![
          'comments',
          'attachments',
          'children',
          'relations',
          'inverseRelations',
        ].includes(key)
    )
  );
  value.labels = value.labels.nodes;
  value.state = { name: 'Backlog', type: 'backlog' };
  return value;
}
const cohortEvidence = (count = 1) => ({
  observedAt: 1_792_180_800,
  cohortMetadataPreimages: Object.fromEntries(
    Array.from({ length: count }, (_value, index) => [
      id(index + 1),
      metadata(index + 1),
    ])
  ),
});
const currentMetadata = value => ({
  ...clone(value),
  labels: {
    nodes: clone(value.labels),
    pageInfo: { hasNextPage: false, endCursor: null },
  },
});
const cohortPage = (rows, hasNextPage = false, endCursor = null) => ({
  issues: {
    nodes: rows.map(currentMetadata),
    pageInfo: { hasNextPage, endCursor },
  },
});
function cohortClient(pages) {
  const calls = [];
  return {
    calls,
    async graphql(query, variables, options) {
      calls.push({ query, variables, options });
      return clone(pages[calls.length - 1]);
    },
  };
}

test('global cohort uses the exact native OR filter with explicitly nested High readiness AND and complete bounded pages', async () => {
  const retained = cohortEvidence(51),
    values = Object.values(retained.cohortMetadataPreimages);
  values[0].title = 'P0 音楽';
  const client = cohortClient([
    cohortPage(values.slice(0, 50), true, 'cursor-one'),
    cohortPage(values.slice(50)),
  ]);
  const options = {
    maxAttempts: 1,
    timeoutMs: 4_000,
    guardAbortSignal: new AbortController().signal,
  };
  assert.equal(await assertCurrentCohort(client, retained, options), true);
  assert.equal(client.calls.length, 2);
  assert.equal(client.calls[0].options, options);
  assert.equal(client.calls[1].options, options);
  assert.deepEqual(
    client.calls.map(call => call.variables.after),
    [null, 'cursor-one']
  );
  assert.deepEqual(client.calls[0].variables.filter, {
    team: { key: { eq: 'JOV' } },
    state: { name: { in: ['Backlog', 'Todo'] } },
    or: [
      { priority: { eq: 1 } },
      {
        and: [
          { priority: { eq: 2 } },
          { labels: { some: { name: { eq: 'agent-ready' } } } },
          { labels: { some: { name: { eq: 'dispatch-next' } } } },
        ],
      },
      { labels: { some: { name: { eq: 'P0' } } } },
      { title: { startsWith: 'P0' } },
      { title: { startsWith: '[P0]' } },
    ],
  });
  assert.match(
    client.calls[0].query,
    /issues\(first:50,after:\$after,includeArchived:false,filter:\$filter\)/
  );
  assert.match(
    client.calls[0].query,
    /labels\(first:50\)\{pageInfo\{hasNextPage endCursor\} nodes\{id name\}\}/
  );
  assert.doesNotMatch(
    client.calls[0].query,
    /comments|attachments|relations|mutation/
  );
  assert.equal(retained.observedAt, 1_792_180_800);
});

test('new urgent membership, removal, priority, owner, delegate and readiness changes hold the whole cohort', async () => {
  const retained = cohortEvidence(2),
    baseline = Object.values(retained.cohortMetadataPreimages);
  const variants = [
    rows => rows.push(metadata(3)),
    rows => rows.pop(),
    rows => {
      rows[0].priority = 2;
    },
    rows => {
      rows[0].assignee = person(70);
    },
    rows => {
      rows[1].delegate = person(71);
    },
    rows => {
      rows[1].labels[0].name = 'blocked';
    },
    rows => {
      rows[1].state = { name: 'Todo', type: 'unstarted' };
    },
    rows => {
      rows[1].updatedAt = '2026-10-16T20:00:01Z';
    },
    rows => {
      rows[1].description = 'A new execution constraint';
    },
  ];
  for (const change of variants) {
    const rows = clone(baseline);
    change(rows);
    const client = cohortClient([cohortPage(rows)]);
    await assert.rejects(
      assertCurrentCohort(client, retained, {}),
      error => error.effect === 'unknown'
    );
    assert.equal(client.calls.length, 1);
  }
});

test('global postwrite permits only selected exact admission and preserves every other cohort preimage', async () => {
  const retained = cohortEvidence(2),
    rows = Object.values(clone(retained.cohortMetadataPreimages));
  rows[0].state = { name: 'Todo', type: 'unstarted' };
  rows[0].updatedAt = '2026-10-16T20:00:01.000Z';
  assert.equal(
    await assertCurrentCohort(
      cohortClient([cohortPage(rows)]),
      retained,
      {},
      { transitionedIssueId: id(1) }
    ),
    true
  );
  await assert.rejects(
    assertCurrentCohort(cohortClient([cohortPage(rows)]), retained, {}),
    held('backlog-cohort-preimage-changed')
  );
  for (const change of [
    values => {
      values[0].updatedAt = '2026-10-16T19:59:59Z';
    },
    values => {
      values[0].assignee = person(72);
    },
    values => {
      values[1].state = { name: 'Todo', type: 'unstarted' };
    },
    values => {
      values[1].priority = 2;
    },
  ]) {
    const values = clone(rows);
    change(values);
    await assert.rejects(
      assertCurrentCohort(
        cohortClient([cohortPage(values)]),
        retained,
        {},
        { transitionedIssueId: id(1) }
      ),
      held('backlog-cohort-preimage-changed')
    );
  }
});

test('new pages, cursor loops, malformed pages and partial labels never expand the retained final-read budget', async () => {
  const retained = cohortEvidence(51),
    values = Object.values(retained.cohortMetadataPreimages);
  const extraPage = cohortClient([
    cohortPage(values.slice(0, 50), true, 'one'),
    cohortPage(values.slice(50), true, 'two'),
  ]);
  await assert.rejects(
    assertCurrentCohort(extraPage, retained, {}),
    held('backlog-cohort-pagination-bound')
  );
  assert.equal(extraPage.calls.length, 2);
  const loop = cohortClient([
    cohortPage(values.slice(0, 50), true, 'one'),
    cohortPage(values.slice(50), true, 'one'),
  ]);
  await assert.rejects(
    assertCurrentCohort(loop, retained, {}),
    held('backlog-cohort-cursor-unreadable')
  );
  const missingCursor = cohortClient([
    cohortPage(values.slice(0, 50), true, null),
  ]);
  await assert.rejects(
    assertCurrentCohort(missingCursor, retained, {}),
    held('backlog-cohort-cursor-unreadable')
  );
  for (const change of [
    page => {
      page.issues.nodes[0].labels.pageInfo.hasNextPage = true;
    },
    page => {
      page.issues.nodes[0].labels.pageInfo = {};
    },
    page => {
      page.issues.nodes[0].labels.nodes.push(
        clone(page.issues.nodes[0].labels.nodes[0])
      );
    },
    page => {
      page.issues.nodes.push(clone(page.issues.nodes[0]));
    },
    page => {
      page.issues.pageInfo.hasNextPage = 'false';
    },
    page => {
      delete page.issues.pageInfo.endCursor;
    },
    page => {
      page.issues.nodes = null;
    },
    page => {
      page.issues.nodes = Array.from(
        { length: 51 },
        () => page.issues.nodes[0]
      );
    },
    page => {
      page.extra = true;
    },
  ]) {
    const page = cohortPage([metadata(1)]);
    change(page);
    const client = cohortClient([page]);
    await assert.rejects(
      assertCurrentCohort(client, cohortEvidence(), {}),
      error => error.effect === 'unknown'
    );
    assert.equal(client.calls.length, 1);
  }
});

test('cohort projections preserve Unicode and ignore only deterministic object and label ordering', async () => {
  const retained = cohortEvidence(),
    value = metadata(1);
  value.labels.reverse();
  const reordered = Object.fromEntries(Object.entries(value).reverse());
  assert.equal(
    await assertCurrentCohort(
      cohortClient([cohortPage([reordered])]),
      retained,
      {}
    ),
    true
  );
  const changed = clone(value);
  changed.title += ' 🎹';
  await assert.rejects(
    assertCurrentCohort(cohortClient([cohortPage([changed])]), retained, {}),
    held('backlog-cohort-preimage-changed')
  );
});

test('invalid retained cohort evidence and out-of-scope actual rows stay held without broad joins or retries', async () => {
  let calls = 0;
  const client = {
    async graphql() {
      calls++;
      throw Error('unexpected query');
    },
  };
  const duplicate = cohortEvidence(2);
  duplicate.cohortMetadataPreimages[id(2)].identifier = 'JOV-6641';
  const tooMany = cohortEvidence(5001);
  const partial = cohortEvidence();
  partial.cohortMetadataPreimages[id(1)].labels = { nodes: [] };
  for (const value of [
    null,
    {},
    { ...cohortEvidence(), observedAt: NaN },
    { observedAt: 1, cohortMetadataPreimages: {} },
    { observedAt: 1, cohortMetadataPreimages: { bad: metadata(1) } },
    tooMany,
    duplicate,
    partial,
  ])
    await assert.rejects(
      assertCurrentCohort(client, value, {}),
      error => error.effect === 'unknown'
    );
  assert.equal(calls, 0);
  await assert.rejects(
    assertCurrentCohort({}, cohortEvidence(), {}),
    held('backlog-current-client-unavailable')
  );
  for (const change of [
    value => {
      value.identifier = 'LYB-6641';
    },
    value => {
      value.archivedAt = VERSION;
    },
    value => {
      value.state = { name: 'In Progress', type: 'started' };
    },
    value => {
      value.state.type = 'triage';
    },
    value => {
      value.priority = 2;
      value.labels = [{ id: id(10), name: 'agent-ready' }];
    },
    value => {
      value.priority = 3;
      value.labels = [];
    },
  ]) {
    const value = metadata(1);
    change(value);
    await assert.rejects(
      assertCurrentCohort(
        cohortClient([cohortPage([value])]),
        cohortEvidence(),
        {}
      ),
      held('backlog-cohort-scope-unverified')
    );
  }
  const failure = Error('bounded-cohort-query-failure');
  await assert.rejects(
    assertCurrentCohort(
      {
        async graphql() {
          calls++;
          throw failure;
        },
      },
      cohortEvidence(),
      {}
    ),
    error => error === failure
  );
  assert.equal(calls, 1);
});

test('the retained cohort supports only native Urgent, designated High and explicit P0 membership', async () => {
  for (const change of [
    value => {
      value.priority = 1;
      value.labels = [];
    },
    value => {
      value.priority = 2;
      value.labels = [
        { id: id(10), name: 'agent-ready' },
        { id: id(11), name: 'dispatch-next' },
      ];
    },
    value => {
      value.priority = 3;
      value.labels = [{ id: id(11), name: 'P0' }];
    },
    value => {
      value.priority = 4;
      value.labels = [];
      value.title = 'P0 explicit launch issue';
    },
    value => {
      value.priority = 4;
      value.labels = [];
      value.title = '[P0] explicit launch issue';
    },
  ]) {
    const value = metadata(1);
    change(value);
    const retained = {
      observedAt: 1_792_180_800,
      cohortMetadataPreimages: { [id(1)]: clone(value) },
    };
    assert.equal(
      await assertCurrentCohort(
        cohortClient([cohortPage([value])]),
        retained,
        {}
      ),
      true
    );
  }
});

test('existing catch-up fetch returns the same complete native metadata projection without an expected packet', async () => {
  const values = Object.values(
    cohortEvidence(51).cohortMetadataPreimages
  ).reverse();
  const client = cohortClient([
    cohortPage(values.slice(0, 50), true, 'next'),
    cohortPage(values.slice(50)),
  ]);
  const options = { maxAttempts: 1, timeoutMs: 4_000 };
  const result = await fetchBacklogSweepCandidates(client, options);
  assert.equal(client.calls.length, 2);
  assert.deepEqual(
    result,
    values.sort((a, b) => (a.id < b.id ? -1 : 1))
  );
  assert.ok(result.every(value => Array.isArray(value.labels)));
  assert.ok(
    result.every(value => !Object.hasOwn(value, 'authorizesTransition'))
  );
  assert.deepEqual(
    client.calls.map(call => call.variables.after),
    [null, 'next']
  );
  assert.ok(client.calls.every(call => call.options === options));
  const retainedClient = cohortClient([cohortPage(result)]);
  const sweepClient = cohortClient([cohortPage(result)]);
  // The malformed oversized single page fails equally through both APIs;
  // their query and filter remain one shared maintained implementation.
  await assert.rejects(
    assertCurrentCohort(retainedClient, cohortEvidence(51), options),
    held('backlog-cohort-page-unreadable')
  );
  await assert.rejects(
    fetchBacklogSweepCandidates(sweepClient, options),
    held('backlog-cohort-page-unreadable')
  );
  assert.deepEqual(retainedClient.calls[0], sweepClient.calls[0]);
  assert.deepEqual(
    await fetchBacklogSweepCandidates(cohortClient([cohortPage([])]), options),
    []
  );
});

test('catch-up fetch caps a complete census at twenty pages and never returns a truncated prefix', async () => {
  const values = Object.values(cohortEvidence(1000).cohortMetadataPreimages);
  const pages = Array.from({ length: 20 }, (_value, index) =>
    cohortPage(
      values.slice(index * 50, (index + 1) * 50),
      index < 19,
      index < 19 ? `cursor-${index}` : null
    )
  );
  const full = cohortClient(pages);
  assert.equal((await fetchBacklogSweepCandidates(full, {})).length, 1000);
  assert.equal(full.calls.length, 20);
  pages[19].issues.pageInfo = { hasNextPage: true, endCursor: 'twenty-first' };
  const truncated = cohortClient(pages);
  await assert.rejects(
    fetchBacklogSweepCandidates(truncated, {}),
    held('backlog-cohort-pagination-bound')
  );
  assert.equal(truncated.calls.length, 20);
});

test('catch-up fetch rejects partial labels, cross-page duplicates, cursor loops and provider failures without retry', async () => {
  const partial = cohortPage([metadata(1)]);
  partial.issues.nodes[0].labels.pageInfo.hasNextPage = true;
  await assert.rejects(
    fetchBacklogSweepCandidates(cohortClient([partial]), {}),
    held('backlog-cohort-labels-incomplete')
  );
  const duplicated = cohortClient([
    cohortPage([metadata(1)], true, 'one'),
    cohortPage([metadata(1)]),
  ]);
  await assert.rejects(
    fetchBacklogSweepCandidates(duplicated, {}),
    held('backlog-cohort-identity-duplicate')
  );
  const loop = cohortClient([
    cohortPage([metadata(1)], true, 'one'),
    cohortPage([metadata(2)], true, 'one'),
  ]);
  await assert.rejects(
    fetchBacklogSweepCandidates(loop, {}),
    held('backlog-cohort-cursor-unreadable')
  );
  await assert.rejects(
    fetchBacklogSweepCandidates({}, {}),
    held('backlog-current-client-unavailable')
  );
  let calls = 0;
  const failure = Error('bounded-read-failed');
  await assert.rejects(
    fetchBacklogSweepCandidates(
      {
        async graphql() {
          calls++;
          throw failure;
        },
      },
      {}
    ),
    error => error === failure
  );
  assert.equal(calls, 1);
});
