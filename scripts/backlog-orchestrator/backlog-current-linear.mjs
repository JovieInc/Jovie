// Current critical preimages for the existing Fleet writer, never admission
// authority. Bounded reads; no retries, writes, joins or provider fallback.
const MAX_ISSUES = 8;
const PAGE_SIZE = 100;
const COHORT_PAGE_SIZE = 50;
const MAX_COHORT_PAGES = 100;
const SWEEP_MAX_PAGES = 20;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const CORE =
  'id identifier title description createdAt updatedAt priority archivedAt state{name type} assignee{id name} delegate{id name} parent{id identifier}';
const CORE_KEYS = [
  'id',
  'identifier',
  'title',
  'description',
  'createdAt',
  'updatedAt',
  'priority',
  'archivedAt',
  'state',
  'assignee',
  'delegate',
  'parent',
];
const CONNECTIONS = {
  labels: 'id name',
  comments: 'id body createdAt user{id name}',
  attachments: 'id title url',
  children: 'id identifier state{name type}',
  relations: 'id type relatedIssue{id identifier}',
  inverseRelations: 'id type issue{id identifier}',
};
const record = value =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const keysAre = (value, keys) =>
  record(value) &&
  Object.keys(value).length === keys.length &&
  keys.every(key => Object.hasOwn(value, key));
const timestamp = value =>
  typeof value === 'string' &&
  ISO.test(value) &&
  Number.isFinite(Date.parse(value));
const text = value => typeof value === 'string';
const identity = value =>
  keysAre(value, ['id', 'identifier']) &&
  UUID.test(value.id) &&
  typeof value.identifier === 'string' &&
  /^[A-Za-z][A-Za-z0-9]*-[1-9][0-9]*$/.test(value.identifier);
const person = value =>
  value === null ||
  (keysAre(value, ['id', 'name']) && UUID.test(value.id) && text(value.name));
const state = value =>
  keysAre(value, ['name', 'type']) &&
  text(value.name) &&
  value.name.length > 0 &&
  text(value.type) &&
  value.type.length > 0;

function held(code) {
  return Object.assign(new Error(code), {
    code,
    effect: 'unknown',
    authorizesTransition: false,
    authorizesDispatch: false,
  });
}

function nodeProjection(name, node) {
  const fields = CONNECTIONS[name];
  const scalar = fields.split(' ').filter(field => !field.includes('{'));
  const required =
    name === 'comments'
      ? ['id', 'body', 'createdAt', 'user']
      : name === 'children'
        ? ['id', 'identifier', 'state']
        : name === 'relations'
          ? ['id', 'type', 'relatedIssue']
          : name === 'inverseRelations'
            ? ['id', 'type', 'issue']
            : scalar;
  if (!keysAre(node, required) || !UUID.test(node.id))
    throw held('backlog-current-node-malformed');
  if (name === 'labels' && text(node.name))
    return { id: node.id, name: node.name };
  if (
    name === 'comments' &&
    text(node.body) &&
    timestamp(node.createdAt) &&
    person(node.user)
  )
    return {
      id: node.id,
      body: node.body,
      createdAt: node.createdAt,
      user: node.user,
    };
  if (name === 'attachments' && text(node.title) && text(node.url))
    return { id: node.id, title: node.title, url: node.url };
  if (
    name === 'children' &&
    identity({ id: node.id, identifier: node.identifier }) &&
    state(node.state)
  )
    return { id: node.id, identifier: node.identifier, state: node.state };
  if (name === 'relations' && text(node.type) && identity(node.relatedIssue))
    return { id: node.id, type: node.type, relatedIssue: node.relatedIssue };
  if (name === 'inverseRelations' && text(node.type) && identity(node.issue))
    return { id: node.id, type: node.type, issue: node.issue };
  throw held('backlog-current-node-malformed');
}

function coreProjection(row, expectedId, keys) {
  if (
    !keysAre(row, keys) ||
    row.id !== expectedId ||
    !identity({ id: row.id, identifier: row.identifier }) ||
    !text(row.title) ||
    !(row.description === null || text(row.description)) ||
    !timestamp(row.createdAt) ||
    !timestamp(row.updatedAt) ||
    !(row.archivedAt === null || timestamp(row.archivedAt)) ||
    !Number.isInteger(row.priority) ||
    row.priority < 0 ||
    row.priority > 4 ||
    !state(row.state) ||
    !person(row.assignee) ||
    !person(row.delegate) ||
    !(row.parent === null || identity(row.parent))
  )
    throw held('backlog-current-row-malformed');
  return Object.fromEntries(CORE_KEYS.map(key => [key, row[key]]));
}

function rowProjection(row, expectedId) {
  const projected = coreProjection(row, expectedId, [
    ...CORE_KEYS,
    ...Object.keys(CONNECTIONS),
  ]);
  for (const name of Object.keys(CONNECTIONS)) {
    const connection = row[name];
    if (
      !keysAre(connection, ['nodes', 'pageInfo']) ||
      !keysAre(connection.pageInfo, ['hasNextPage']) ||
      connection.pageInfo.hasNextPage !== false ||
      !Array.isArray(connection.nodes) ||
      connection.nodes.length > PAGE_SIZE
    )
      throw held('backlog-current-connection-incomplete');
    const nodes = connection.nodes.map(node => nodeProjection(name, node));
    if (new Set(nodes.map(node => node.id)).size !== nodes.length)
      throw held('backlog-current-node-duplicate');
    projected[name] = {
      nodes: nodes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    };
  }
  return projected;
}

function preimages(value) {
  if (!record(value)) throw held('backlog-current-preimages-invalid');
  const ids = Object.keys(value).sort();
  if (
    ids.length < 1 ||
    ids.length > MAX_ISSUES ||
    ids.some(id => !UUID.test(id))
  )
    throw held('backlog-current-preimages-bound');
  const rows = Object.fromEntries(
    ids.map(id => [id, rowProjection(value[id], id)])
  );
  if (
    new Set(Object.values(rows).map(row => row.identifier)).size !== ids.length
  )
    throw held('backlog-current-identity-duplicate');
  return { ids, rows };
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (record(value))
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

/** Read the trusted native selected/direct-prerequisite set, without updating
 * its original observation timestamp. Root supplies its bounded live transport. */
export async function readBacklogCurrent(client, evidence, options) {
  if (
    !Number.isFinite(evidence?.linearPreimagesObservedAt) ||
    evidence.linearPreimagesObservedAt <= 0
  )
    throw held('backlog-current-observation-unbound');
  const expected = preimages(evidence.linearPreimages);
  if (typeof client?.graphql !== 'function')
    throw held('backlog-current-client-unavailable');
  const variables = Object.fromEntries(
    expected.ids.map((id, index) => [`id${index}`, id])
  );
  const declarations = expected.ids
    .map((_id, index) => `$id${index}:String!`)
    .join(',');
  const connections = Object.entries(CONNECTIONS)
    .map(
      ([name, fields]) =>
        `${name}(first:${PAGE_SIZE}){nodes{${fields}} pageInfo{hasNextPage}}`
    )
    .join(' ');
  const selections = expected.ids
    .map(
      (_id, index) =>
        `issue${index}:issue(id:$id${index}){${CORE} ${connections}}`
    )
    .join(' ');
  const response = await client.graphql(
    `query(${declarations}){${selections}}`,
    variables,
    options
  );
  const aliases = expected.ids.map((_id, index) => `issue${index}`);
  if (!keysAre(response, aliases))
    throw held('backlog-current-response-identities-invalid');
  const actual = Object.fromEntries(
    expected.ids.map((id, index) => {
      const row = response[`issue${index}`];
      rowProjection(row, id);
      if (row.identifier !== expected.rows[id].identifier)
        throw held('backlog-current-identity-changed');
      return [id, row];
    })
  );
  return actual;
}

/** Both sets must be complete. Only the selected issue's exact admission
 * state change and nondecreasing updatedAt may differ after a write. */
export function criticalPreimagesMatch(
  actual,
  expected,
  { transitionedIssueId = null } = {}
) {
  const current = preimages(actual),
    prior = preimages(expected);
  if (canonical(current.ids) !== canonical(prior.ids))
    throw held('backlog-current-identity-set-changed');
  return projectedMatch(current.rows, prior.rows, transitionedIssueId);
}

function projectedMatch(current, prior, transitionedIssueId) {
  if (transitionedIssueId !== null) {
    if (!Object.hasOwn(current, transitionedIssueId))
      throw held('backlog-current-transition-identity-invalid');
    const before = prior[transitionedIssueId],
      after = current[transitionedIssueId];
    if (
      before.state.name !== 'Backlog' ||
      before.state.type !== 'backlog' ||
      after.state.name !== 'Todo' ||
      after.state.type !== 'unstarted' ||
      Date.parse(after.updatedAt) < Date.parse(before.updatedAt)
    )
      return false;
    after.state = before.state;
    after.updatedAt = before.updatedAt;
  }
  return canonical(current) === canonical(prior);
}

function metadataProjection(row, expectedId, prepared = false) {
  const projected = coreProjection(row, expectedId, [...CORE_KEYS, 'labels']);
  let labels = row.labels;
  if (!prepared) {
    if (
      !keysAre(labels, ['nodes', 'pageInfo']) ||
      !keysAre(labels.pageInfo, ['hasNextPage', 'endCursor']) ||
      labels.pageInfo.hasNextPage !== false ||
      !(labels.pageInfo.endCursor === null || text(labels.pageInfo.endCursor))
    )
      throw held('backlog-cohort-labels-incomplete');
    labels = labels.nodes;
  }
  if (!Array.isArray(labels) || labels.length > COHORT_PAGE_SIZE)
    throw held('backlog-cohort-labels-incomplete');
  const nodes = labels.map(node => nodeProjection('labels', node));
  if (new Set(nodes.map(node => node.id)).size !== nodes.length)
    throw held('backlog-current-node-duplicate');
  projected.labels = nodes.sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  );
  const names = new Set(nodes.map(node => node.name));
  if (
    !/^JOV-[1-9][0-9]*$/.test(projected.identifier) ||
    projected.archivedAt !== null ||
    !['Backlog', 'Todo'].includes(projected.state.name) ||
    { Backlog: 'backlog', Todo: 'unstarted' }[projected.state.name] !==
      projected.state.type ||
    !(
      projected.priority === 1 ||
      (projected.priority === 2 &&
        names.has('agent-ready') &&
        names.has('dispatch-next')) ||
      names.has('P0') ||
      projected.title.startsWith('P0') ||
      projected.title.startsWith('[P0]')
    )
  )
    throw held('backlog-cohort-scope-unverified');
  return projected;
}

/** Reuse the native cohort's exact filter and metadata shape. Pagination may
 * consume only the retained page count; a changed/unknown global pool holds.
 * This checks current ranking inputs, never the expensive PR/history joins. */
export async function assertCurrentCohort(
  client,
  evidence,
  options,
  { transitionedIssueId = null } = {}
) {
  const retained = evidence?.cohortMetadataPreimages;
  if (
    !Number.isFinite(evidence?.observedAt) ||
    evidence.observedAt <= 0 ||
    !record(retained)
  )
    throw held('backlog-cohort-observation-unbound');
  const ids = Object.keys(retained).sort();
  if (
    ids.length < 1 ||
    ids.length > COHORT_PAGE_SIZE * MAX_COHORT_PAGES ||
    ids.some(id => !UUID.test(id))
  )
    throw held('backlog-cohort-preimages-bound');
  const expected = Object.fromEntries(
    ids.map(id => [id, metadataProjection(retained[id], id, true)])
  );
  if (
    new Set(Object.values(expected).map(row => row.identifier)).size !==
    ids.length
  )
    throw held('backlog-current-identity-duplicate');
  const actual = await readCohort(
    client,
    options,
    Math.ceil(ids.length / COHORT_PAGE_SIZE),
    expected
  );
  if (canonical(Object.keys(actual).sort()) !== canonical(ids))
    throw held('backlog-cohort-membership-changed');
  if (!projectedMatch(actual, expected, transitionedIssueId))
    throw held('backlog-cohort-preimage-changed');
  return true;
}

/** Complete metadata for the existing catch-up cycle. This is a read-only
 * candidate census, not readiness, custody, ranking or dispatch authority. */
export async function fetchBacklogSweepCandidates(client, options) {
  const rows = await readCohort(client, options, SWEEP_MAX_PAGES);
  return Object.keys(rows)
    .sort()
    .map(id => rows[id]);
}

async function readCohort(client, options, maxPages, expected = null) {
  if (typeof client?.graphql !== 'function')
    throw held('backlog-current-client-unavailable');
  const filter = {
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
  };
  const query = `query($filter:IssueFilter!,$after:String){issues(first:50,after:$after,includeArchived:false,filter:$filter){pageInfo{hasNextPage endCursor} nodes{${CORE} labels(first:50){pageInfo{hasNextPage endCursor} nodes{id name}}}}}`;
  const actual = {},
    cursors = new Set(),
    identifiers = new Set();
  let after = null;
  for (let page = 0; page < maxPages; page++) {
    const response = await client.graphql(query, { filter, after }, options);
    const connection = response?.issues;
    if (
      !keysAre(response, ['issues']) ||
      !keysAre(connection, ['nodes', 'pageInfo']) ||
      !Array.isArray(connection.nodes) ||
      connection.nodes.length > COHORT_PAGE_SIZE ||
      !keysAre(connection.pageInfo, ['hasNextPage', 'endCursor']) ||
      typeof connection.pageInfo.hasNextPage !== 'boolean' ||
      !(
        connection.pageInfo.endCursor === null ||
        text(connection.pageInfo.endCursor)
      )
    )
      throw held('backlog-cohort-page-unreadable');
    for (const row of connection.nodes) {
      const projected = metadataProjection(row, row?.id);
      if (
        Object.hasOwn(actual, projected.id) ||
        identifiers.has(projected.identifier)
      )
        throw held('backlog-cohort-identity-duplicate');
      if (expected && !Object.hasOwn(expected, projected.id))
        throw held('backlog-cohort-membership-changed');
      actual[projected.id] = projected;
      identifiers.add(projected.identifier);
    }
    if (!connection.pageInfo.hasNextPage) return actual;
    const next = connection.pageInfo.endCursor;
    if (!next || cursors.has(next))
      throw held('backlog-cohort-cursor-unreadable');
    cursors.add(next);
    after = next;
  }
  throw held('backlog-cohort-pagination-bound');
}
