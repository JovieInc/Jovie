import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { routeChangedFiles } from '../../../.github/scripts/pr-visual-capture-surfaces.mjs';
import { evaluateVisualEvidence } from '../../../.github/scripts/pr-visual-evidence-gate.mjs';

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
