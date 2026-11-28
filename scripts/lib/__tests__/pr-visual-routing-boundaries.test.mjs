import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { prepareExternalCapture } from '../../../.github/scripts/pr-visual-capture-external.mjs';
import { routeChangedFiles } from '../../../.github/scripts/pr-visual-capture-surfaces.mjs';
import { evaluateVisualEvidence } from '../../../.github/scripts/pr-visual-evidence-gate.mjs';
import { validateCaptureManifest } from '../../../.github/scripts/pr-visual-review.mjs';

// Exact failed inputs from PR26970, run45953109499 (JOV-15384).
const CHAT_REGRESSION = [
  'apps/web/app/api/chat/confirm-edit/route.ts',
  'apps/web/components/features/dashboard/dashboard-nav/DashboardNav.test.tsx',
  'apps/web/components/features/dashboard/dashboard-nav/DashboardNav.tsx',
  'apps/web/lib/ai/tools/bio-text.test.ts',
  'apps/web/lib/ai/tools/bio-text.ts',
  'apps/web/lib/ai/tools/extract-bio-candidate.ts',
  'apps/web/lib/ai/tools/import-bio-from-url.ts',
  'apps/web/lib/chat/message-text.test.ts',
  'apps/web/lib/chat/message-text.ts',
  'apps/web/lib/chat/new-chat-intent.ts',
  'apps/web/lib/chat/request-validation.ts',
  'apps/web/lib/chat/system-prompt.ts',
  'apps/web/lib/chat/tool-ui-registry.test.ts',
  'apps/web/lib/chat/tool-ui-registry.ts',
  'apps/web/lib/chat/types.ts',
];

// Exact unsupported inputs from PR26973, run45972255704. These implement
// SQL/authorization/tool calls and data contracts, not rendered components.
const TASK_SERVER_REGRESSION = [
  'apps/web/app/app/(shell)/dashboard/tasks/task-actions.test.ts',
  'apps/web/app/app/(shell)/dashboard/tasks/task-actions.ts',
  'apps/web/lib/chat/tool-schemas.ts',
  'apps/web/lib/chat/tools/tasks.test.ts',
  'apps/web/lib/chat/tools/tasks.ts',
  'apps/web/lib/db/client/connection.ts',
  'apps/web/lib/db/client/schema-db.ts',
  'apps/web/lib/tasks/errors.ts',
  'apps/web/lib/tasks/mutation-validation.server.ts',
  'apps/web/lib/tasks/mutations.server.ts',
  'apps/web/lib/tasks/task-view.ts',
  'apps/web/lib/tasks/types.ts',
];

test('server-only task changes do not request unrelated or nonexistent screenshots', () => {
  assert.deepEqual(routeChangedFiles(TASK_SERVER_REGRESSION), {
    shouldReview: false,
    routes: [],
    reason: 'no-ui-change',
    review_status: 'skipped',
  });
});

test('query README is repository guidance without exempting neighboring UI', () => {
  const guide = 'apps/web/lib/queries/README.md';
  assert.deepEqual(routeChangedFiles([guide]), {
    shouldReview: false,
    routes: [],
    reason: 'no-ui-change',
    review_status: 'skipped',
  });
  assert.deepEqual(
    routeChangedFiles([guide, 'apps/web/lib/queries/useTasksQuery.ts']),
    {
      shouldReview: true,
      routes: ['/app/tasks'],
      reason: 'ui-change',
      review_status: 'advisory',
    }
  );
  for (const file of [
    'apps/web/lib/queries/UnknownPanel.tsx',
    'apps/web/lib/queries/OTHER.md',
  ]) {
    const routed = routeChangedFiles([guide, file]);
    assert.equal(routed.review_status, 'unavailable');
    assert.deepEqual(routed.missingCoverage, [
      { file, reason: 'unsupported-surface' },
    ]);
  }
});

test('ordinary unit tests have no independent rendered surface', () => {
  assert.equal(
    routeChangedFiles(CHAT_REGRESSION.filter(file => file.includes('.test.')))
      .shouldReview,
    false
  );
  assert.equal(
    routeChangedFiles([
      'apps/web/components/features/chat/ChatMessage.stories.tsx',
      'apps/web/tests/visual-qa/chat.spec.ts',
    ]).shouldReview,
    true
  );
});

test('mixed chat changes keep their real surface and name the unavailable interactive states', () => {
  const actual = routeChangedFiles(CHAT_REGRESSION);
  assert.deepEqual(actual.routes, ['/app/chat']);
  assert.equal(actual.shouldReview, true);
  assert.equal(actual.review_status, 'unavailable');
  assert.deepEqual(actual.missingCoverage, [
    {
      file: 'apps/web/lib/chat/message-text.ts',
      reason: 'missing-state-producer',
      requiredState: 'chat-populated-thread',
    },
    {
      file: 'apps/web/lib/chat/new-chat-intent.ts',
      reason: 'missing-state-producer',
      requiredState: 'chat-conversation-reset',
    },
    {
      file: 'apps/web/lib/chat/tool-ui-registry.ts',
      reason: 'missing-state-producer',
      requiredState: 'chat-tool-result',
    },
  ]);
});

test('DashboardNav chrome uses the existing authenticated loaded shell producer', () => {
  assert.deepEqual(
    routeChangedFiles([
      'apps/web/components/features/dashboard/dashboard-nav/DashboardNav.tsx',
      'apps/web/app/api/chat/confirm-edit/route.ts',
    ]),
    {
      shouldReview: true,
      routes: ['/app/chat'],
      reason: 'ui-change',
      review_status: 'advisory',
    }
  );
});

test('known data modules do not create a blanket library or neighboring-file exemption', () => {
  for (const file of [
    'apps/web/lib/tasks/unknown-renderer.ts',
    'apps/web/lib/tasks/types.tsx',
    'apps/web/lib/chat/system-prompt.tsx',
    'apps/web/lib/db/client/connection-widget.tsx',
    'apps/web/app/api/unmapped/route.ts',
  ]) {
    assert.deepEqual(routeChangedFiles([file]).missingCoverage, [
      { file, reason: 'unsupported-surface' },
    ]);
  }
});

test('non-rendering inputs cannot hide unsupported admin or native surfaces', () => {
  const unsupported = [
    'apps/web/app/(admin)/page.tsx',
    'apps/ios/Jovie/ContactsView.swift',
    'apps/macos/Jovie/ContactsView.swift',
  ];
  const actual = routeChangedFiles([
    ...TASK_SERVER_REGRESSION,
    ...unsupported,
    'apps/web/app/(home)/page.tsx',
  ]);
  assert.deepEqual(actual.routes, ['/']);
  assert.equal(actual.review_status, 'unavailable');
  assert.deepEqual(
    actual.missingCoverage,
    unsupported.map(file => ({
      file,
      reason: 'unsupported-surface',
    }))
  );
});

test('a successful empty-shell artifact cannot satisfy a populated-chat requirement', () => {
  const artifactDir = mkdtempSync(join(tmpdir(), 'visual-state-boundary-'));
  try {
    const head = 'a'.repeat(40);
    writeFileSync(
      join(artifactDir, 'routing.json'),
      JSON.stringify({
        ...routeChangedFiles(['apps/web/lib/chat/tool-ui-registry.ts']),
        head_sha: head,
      })
    );
    writeFileSync(
      join(artifactDir, 'manifest.json'),
      JSON.stringify({
        sourceSha: head,
        routes: ['/app/chat'],
        captures: ['desktop', 'mobile'].map(viewport => ({
          route: '/app/chat',
          viewport,
          status: 'captured',
          observed: { state: 'chat-empty' },
        })),
      })
    );
    const actual = evaluateVisualEvidence({
      artifactDir,
      expectedHeadSha: head,
      stages: { build: 'success', server: 'success', capture: 'success' },
    });
    assert.equal(actual.ok, false);
    assert.equal(actual.advisory, false);
    assert.equal(actual.status, 'unavailable');
    assert.deepEqual(actual.missingEvidence, [
      'unsupported-surface:apps/web/lib/chat/tool-ui-registry.ts',
    ]);
  } finally {
    rmSync(artifactDir, { recursive: true, force: true });
  }
});

function externalPage({
  missingAgent = false,
  working = false,
  overflow = false,
} = {}) {
  const actions = [];
  const locator = path => ({
    filter: () => locator(path),
    first: () => locator(path),
    or: () => locator(path),
    getByTestId: id => locator(`${path}/${id}`),
    getByRole: (role, options) =>
      locator(`${path}/${role}:${String(options?.name ?? '')}`),
    getByText: text => locator(`${path}/${String(text)}`),
    waitFor: async () => {
      if (missingAgent && path.endsWith('/Agent'))
        throw new Error('Agent label missing');
    },
    isVisible: async () => !overflow,
    click: async () => actions.push(path),
    scrollIntoViewIfNeeded: async () => {},
    count: async () => (working ? 1 : 0),
  });
  return { page: locator('page'), actions };
}

const externalRoute = '/app/tasks?capture=external-agent';
const releaseAssigneeRoute = '/renders/surfaces/external-task-assignee';

test('external-assignee routing keeps the task and release renderers distinct', () => {
  assert.deepEqual(
    routeChangedFiles([
      'apps/web/components/features/dashboard/tasks/task-presentation.ts',
      'apps/web/components/features/dashboard/release-tasks/ReleaseTaskAssigneeBadge.tsx',
    ]).routes,
    [externalRoute, releaseAssigneeRoute]
  );
  assert.deepEqual(
    routeChangedFiles([
      'apps/web/app/app/(shell)/dashboard/tasks/_lib/screen-cert-fixture.ts',
    ]).routes,
    ['/app/tasks', externalRoute, '/app/tasks?capture=recording-prepared']
  );
  assert.equal(
    routeChangedFiles([
      'apps/web/lib/tasks/agent-execution.server.ts',
      'apps/web/lib/actions/task-agents/http.ts',
    ]).shouldReview,
    false
  );
  assert.equal(
    routeChangedFiles(['apps/web/lib/tasks/agent-execution-presentation.ts'])
      .review_status,
    'unavailable'
  );
});

test('actual All task consumers must show Agent and Not Started without a working claim', async () => {
  const fixture = externalPage();
  const observed = await prepareExternalCapture(fixture.page, externalRoute);
  assert.equal(observed.state, 'task-external-assignee');
  assert.equal(observed.assignee, 'Agent');
  assert.equal(observed.execution, 'not-started');
  assert.equal(fixture.actions.length, 1);
  assert.match(fixture.actions[0], /tab:/);
  await assert.rejects(
    prepareExternalCapture(
      externalPage({ missingAgent: true }).page,
      externalRoute
    ),
    /Agent label missing/
  );
  await assert.rejects(
    prepareExternalCapture(externalPage({ working: true }).page, externalRoute),
    /Assignment alone/
  );
});

test('narrow task headers select All through the existing overflow menu', async () => {
  const fixture = externalPage({ overflow: true });
  await prepareExternalCapture(fixture.page, externalRoute);
  assert.equal(fixture.actions.length, 2);
  assert.match(fixture.actions[0], /More tabs/);
  assert.match(fixture.actions[1], /menuitemradio:/);
});

test('release badge presentation is read-only and does not imply task execution', async () => {
  const fixture = externalPage();
  const observed = await prepareExternalCapture(
    fixture.page,
    releaseAssigneeRoute
  );
  assert.deepEqual(observed, {
    state: 'release-external-assignee',
    assignee: 'Agent',
    presentationOnly: true,
  });
  assert.deepEqual(fixture.actions, []);
  assert.equal(await prepareExternalCapture(fixture.page, '/app/chat'), null);
});

test('external captures cannot be certified by empty-shell PNGs or a wrong assignee', async () => {
  for (const route of [externalRoute, releaseAssigneeRoute]) {
    const manifest = {
      routes: [route],
      viewports: { desktop: {} },
      captures: [
        { route, viewport: 'desktop', status: 'captured', path: 'actual.png' },
      ],
    };
    assert.equal(validateCaptureManifest(manifest).ok, false);
    manifest.captures[0].observed = await prepareExternalCapture(
      externalPage().page,
      route
    );
    assert.equal(validateCaptureManifest(manifest).ok, true);
    manifest.captures[0].observed.assignee = 'Me';
    assert.equal(validateCaptureManifest(manifest).ok, false);
  }
});

// Exact reviewed HTTP, SQL and lease modules; neighboring renderers stay gated.
const NATIVE_TASK_BACKEND_FILES = [
  'apps/web/lib/actions/fleet/dispatcher.ts',
  'apps/web/lib/actions/fleet/worker-identity.ts',
  'apps/web/lib/actions/task-agents/authority.server.ts',
  'apps/web/lib/actions/task-agents/discovery.ts',
  'apps/web/lib/actions/task-agents/http.ts',
  'apps/web/lib/actions/task-agents/operations.server.ts',
  'apps/web/lib/db/fleet-task-scope.ts',
  'apps/web/lib/db/schema/enums.ts',
  'apps/web/lib/db/schema/tasks.ts',
  'apps/web/lib/tasks/agent-assignment-contract.ts',
  'apps/web/lib/tasks/agent-assignment-workflow.server.ts',
  'apps/web/lib/tasks/agent-assignment.server.ts',
  'apps/web/lib/tasks/agent-connection-state.server.ts',
  'apps/web/lib/tasks/agent-connections.server.ts',
  'apps/web/lib/tasks/agent-execution-state.server.ts',
  'apps/web/lib/tasks/agent-execution.server.ts',
  'apps/web/lib/tasks/agent-mutation-guard.server.ts',
  'apps/web/lib/tasks/agent-results.server.ts',
  'apps/web/lib/tasks/agent-retirement.server.ts',
  'apps/web/lib/tasks/task-move-helpers.server.ts',
  'apps/web/lib/tasks/task-update.ts',
];

test('native authority and task execution modules have no standalone rendered surface', () => {
  assert.deepEqual(routeChangedFiles(NATIVE_TASK_BACKEND_FILES), {
    shouldReview: false,
    routes: [],
    reason: 'no-ui-change',
    review_status: 'skipped',
  });
});

test('reviewed native backend paths do not exempt neighboring presentation', () => {
  for (const file of [
    'apps/web/lib/tasks/agent-execution-presentation.ts',
    'apps/web/lib/actions/task-agents/status-chip.tsx',
    'apps/web/lib/db/fleet-task-widget.tsx',
  ]) {
    assert.deepEqual(
      routeChangedFiles([...NATIVE_TASK_BACKEND_FILES, file]).missingCoverage,
      [{ file, reason: 'unsupported-surface' }]
    );
  }
});

test('native backend entries cannot suppress actual external-assignee renderers', () => {
  for (const file of [
    'apps/web/components/features/dashboard/tasks/task-presentation.ts',
    'apps/web/components/features/dashboard/release-tasks/ReleaseTaskAssigneeBadge.tsx',
  ]) {
    assert.equal(
      routeChangedFiles([...NATIVE_TASK_BACKEND_FILES, file]).shouldReview,
      true
    );
  }
});

// Exact unsupported input from PR26995 (JOV-13012): the send-block predicate
// for synthetic canary mailboxes. Pure string logic, no rendered surface.
test('email address predicates have no standalone rendered surface', () => {
  assert.deepEqual(
    routeChangedFiles([
      'apps/web/lib/utils/email.ts',
      'apps/web/lib/auth/email-otp-sender.test.ts',
      'apps/web/tests/lib/utils/email.test.ts',
    ]),
    {
      shouldReview: false,
      routes: [],
      reason: 'no-ui-change',
      review_status: 'skipped',
    }
  );
  const neighbor = 'apps/web/lib/utils/email-preview.tsx';
  assert.deepEqual(
    routeChangedFiles(['apps/web/lib/utils/email.ts', neighbor])
      .missingCoverage,
    [{ file: neighbor, reason: 'unsupported-surface' }]
  );
});
