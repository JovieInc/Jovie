const UI_FILE =
  /^(apps\/web\/(app|components|features|lib|public|styles|tests\/visual-qa)|packages\/ui|apps\/console\/.*screenshot|apps\/ios\/.*(View|Screen|Snapshot)|.*\.(css|scss|tsx|jsx))\//;
export const PUBLIC_HOME_CAPTURE_ROUTE = '/';
const PUBLIC_CARD_CAPTURE_ROUTE = '/card';
const PUBLIC_CARD_CAPTURE_FILE =
  /^(?:apps\/web\/app\/\(marketing\)\/card\/|apps\/web\/data\/jovieCardCopy\.ts$)/;
export const PUBLIC_PROFILE_CAPTURE_ROUTE = '/demo/showcase/public-profile';
export const AUTHENTICATED_CHAT_CAPTURE_ROUTE = '/app/chat';
export const CONTACTS_CAPTURE_ROUTE = '/app/contacts';
export const ACCOUNT_CAPTURE_ROUTE = '/app/settings/account';
export const TASKS_CAPTURE_ROUTE = '/app/tasks';
export const RECORDING_TASK_CAPTURE_ROUTE =
  '/app/tasks?capture=recording-prepared';
export const RECORDING_HOST_CAPTURE_ROUTE = '/app/tasks?capture=recording-host';
export const EXTERNAL_TASK_CAPTURE_ROUTE = '/app/tasks?capture=external-agent';
export const RELEASE_ASSIGNEE_CAPTURE_ROUTE =
  '/renders/surfaces/external-task-assignee';
export const RECORDING_TAKES_CAPTURE_ROUTE =
  '/renders/surfaces/task-recording-takes';
const CONTACTS_CAPTURE_FILE =
  /^(?:apps\/web\/app\/app\/\(shell\)\/(?:contacts\/|dashboard\/contacts\/)|apps\/web\/components\/features\/dashboard\/(?:organisms\/(?:contacts-table\/|ContactsManager\.)|hooks\/useContactsManager\.|molecules\/Contact(?:ListRow|DeleteConfirmDialog)\.))/;
const NATIVE_UI_FILE =
  /^apps\/(?:ios|mac|macos)\/.*\.(?:swift|xib|storyboard)$/;
// Changes to the session boundary can leave a public route perfectly healthy
// while making every authenticated surface unusable. Keep this deliberately
// narrow: these are the files that establish the app-shell session and route
// guard, not every page under the auth route group.
const AUTHENTICATED_SHELL_CAPTURE_FILE =
  /^(?:apps\/web\/(?:proxy|middleware)\.[cm]?[jt]s|apps\/web\/lib\/auth\/(?:gate|session|auth-session-cookies)\.[cm]?[jt]sx?|apps\/web\/app\/app(?:\/\(shell\))?\/layout\.[cm]?[jt]sx?)$/i;

// Ordinary colocated tests are not a rendered surface. Stories and visual-QA
// specs remain candidates; this does not remove their actual component source.
const UNIT_TEST_FILE =
  /^(?:apps\/web\/(?:app|components|features|lib)\/|packages\/ui\/).*\.(?:test|spec)\.[cm]?[jt]sx?$/;

// Reviewed non-rendering paths from the exact JOV-15384/JOV-8731 failures.
// Keep this explicit: a library neighbor can contain presentation logic.
// These HTTP/SQL/tool operations still require their functional source checks;
// a homepage or an empty chat screenshot cannot certify their behavior.
const NON_RENDERING_FILES = new Set([
  'apps/web/app/api/agents/profiles/route.ts',
  'apps/web/app/api/chat/confirm-edit/route.ts',
  'apps/web/app/api/cron/cleanup-idempotency-keys/route.ts',
  'apps/web/app/api/cron/process-workflow-runs/route.ts',
  'apps/web/app/api/teleprompter/takes/[takeId]/route.ts',
  'apps/web/app/api/v1/actions/[actionId]/invoke/route.ts',
  'apps/web/app/api/v1/actions/route.ts',
  'apps/web/app/app/(shell)/dashboard/releases/catalog-task-actions.ts',
  'apps/web/app/app/(shell)/dashboard/releases/task-actions.ts',
  'apps/web/app/app/(shell)/dashboard/tasks/recording-actions.ts',
  'apps/web/app/app/(shell)/dashboard/tasks/saved-release-plan-actions.ts',
  'apps/web/app/app/(shell)/dashboard/tasks/task-actions.ts',
  'apps/web/lib/actions/execution-ledger.server.ts',
  'apps/web/lib/actions/fleet/dispatcher.ts',
  'apps/web/lib/actions/fleet/worker-identity.ts',
  'apps/web/lib/actions/owner/dispatcher.ts',
  'apps/web/lib/actions/owner/http.ts',
  'apps/web/lib/actions/owner/model.ts',
  'apps/web/lib/actions/owner/retention.ts',
  'apps/web/lib/actions/owner/tasks.ts',
  'apps/web/lib/actions/task-agents/authority.server.ts',
  'apps/web/lib/actions/task-agents/discovery.ts',
  'apps/web/lib/actions/task-agents/http.ts',
  'apps/web/lib/actions/task-agents/operations.server.ts',
  'apps/web/lib/ai/tools/bio-text.ts',
  'apps/web/lib/ai/tools/extract-bio-candidate.ts',
  'apps/web/lib/ai/tools/import-bio-from-url.ts',
  'apps/web/lib/api/public-agent-openapi.ts',
  'apps/web/lib/api/v1/openapi-types.ts',
  'apps/web/lib/api/v1/openapi.ts',
  'apps/web/lib/auth/agent-api-key.ts',
  'apps/web/lib/auth/api-key-plugin.ts',
  'apps/web/lib/auth/better-auth.ts',
  'apps/web/lib/auth/profile-access.ts',
  'apps/web/lib/auth/rate-limit-rules.ts',
  'apps/web/lib/chat/request-validation.ts',
  'apps/web/lib/chat/system-prompt.ts',
  'apps/web/lib/chat/tool-schemas.ts',
  'apps/web/lib/chat/tools/tasks.ts',
  'apps/web/lib/chat/types.ts',
  'apps/web/lib/db/client/connection.ts',
  'apps/web/lib/db/client/schema-db.ts',
  'apps/web/lib/db/client/types.ts',
  'apps/web/lib/db/creator-documents/task-recording.ts',
  'apps/web/lib/db/fleet-task-scope.ts',
  'apps/web/lib/db/schema/action-executions.ts',
  'apps/web/lib/db/schema/api-keys.ts',
  'apps/web/lib/db/schema/enums.ts',
  'apps/web/lib/db/schema/index.ts',
  'apps/web/lib/db/schema/profile-creation-attributions.ts',
  'apps/web/lib/db/schema/tasks.ts',
  'apps/web/lib/entitlements/server.ts',
  'apps/web/lib/ingestion/flows/profile-creation.ts',
  'apps/web/lib/ingestion/flows/social-platform-flow.ts',
  'apps/web/lib/ingestion/flows/social-platform-ingest.ts',
  // Repository guidance; no rendered route or application import consumes it.
  'apps/web/lib/queries/README.md',
  'apps/web/lib/rate-limit/agent-profile-config.ts',
  'apps/web/lib/rate-limit/agent-profile-limiters.ts',
  'apps/web/lib/rate-limit/config.ts',
  'apps/web/lib/rate-limit/index.ts',
  'apps/web/lib/rate-limit/limiters.ts',
  'apps/web/lib/rate-limit/outage-policy.ts',
  'apps/web/lib/stripe/customer-sync.ts',
  'apps/web/lib/stripe/customer-sync/billing-info.ts',
  'apps/web/lib/stripe/customer-sync/index.ts',
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
  'apps/web/lib/tasks/dedupe-release-tasks.ts',
  'apps/web/lib/tasks/errors.ts',
  'apps/web/lib/tasks/mutation-validation.server.ts',
  'apps/web/lib/tasks/mutations.server.ts',
  'apps/web/lib/tasks/playbooks/instantiate.ts',
  'apps/web/lib/tasks/playbooks/materialize-release-plan.server.ts',
  'apps/web/lib/tasks/playbooks/saved-release-plan.server.ts',
  'apps/web/lib/tasks/playbooks/saved-release-plan.ts',
  'apps/web/lib/tasks/playbooks/types.ts',
  'apps/web/lib/tasks/readers.server.ts',
  'apps/web/lib/tasks/recording-attention-contract.ts',
  'apps/web/lib/tasks/recording-attention-queue.ts',
  'apps/web/lib/tasks/recording-attention-recipient.server.ts',
  'apps/web/lib/tasks/recording-attention.server.ts',
  'apps/web/lib/tasks/recording-intent.server.ts',
  'apps/web/lib/tasks/recording-lease.ts',
  'apps/web/lib/tasks/recording-state.server.ts',
  'apps/web/lib/tasks/recording-takes.server.ts',
  'apps/web/lib/tasks/recording-workflow.server.ts',
  'apps/web/lib/tasks/task-move-helpers.server.ts',
  'apps/web/lib/tasks/task-update.ts',
  'apps/web/lib/tasks/task-view.ts',
  'apps/web/lib/tasks/types.ts',
  'apps/web/lib/teleprompter/takes/route-error.ts',
  'apps/web/lib/teleprompter/takes/server.ts',
]);

// Exact shipped components and their state dependencies; unknown neighbors
// remain unsupported. These producers certify presentation, not execution.
const ACCOUNT_CAPTURE_FILES = new Set([
  'apps/web/app/api/auth/[...all]/route.ts',
  'apps/web/app/app/(shell)/settings/account/page.tsx',
  'apps/web/components/features/dashboard/organisms/account-settings/AccountSettingsSection.tsx',
  'apps/web/components/features/dashboard/organisms/account-settings/ApiKeysCard.stories.tsx',
  'apps/web/components/features/dashboard/organisms/account-settings/ApiKeysCard.tsx',
  'apps/web/lib/auth/api-key-policy.ts',
  'apps/web/lib/auth/client.ts',
  'apps/web/lib/screen-cert/account-read-fixture.server.ts',
]);
const TASKS_CAPTURE_FILES = new Set([
  'apps/web/app/app/(shell)/dashboard/tasks/_lib/screen-cert-fixture.ts',
  'apps/web/app/app/(shell)/tasks/TasksRoute.tsx',
  'apps/web/lib/queries/keys.ts',
  'apps/web/lib/queries/task-mutation-cache.ts',
  'apps/web/lib/queries/task-readback.ts',
  'apps/web/lib/queries/useTaskMutations.ts',
  'apps/web/lib/queries/useTasksQuery.ts',
]);
const RECORDING_TASK_CAPTURE_FILES = new Set([
  'apps/web/components/features/dashboard/tasks/TaskRecordingAction.stories.tsx',
  'apps/web/components/features/dashboard/tasks/TaskRecordingAction.tsx',
  'apps/web/components/features/dashboard/tasks/TasksPageClient.tsx',
  'apps/web/components/features/dashboard/tasks/task-editor-feedback.ts',
]);
const RECORDING_HOST_CAPTURE_FILES = new Set([
  'apps/web/components/features/teleprompter-studio/TeleprompterStudioHost.tsx',
  'apps/web/components/features/teleprompter-studio/use-studio-takes.ts',
  'apps/web/lib/tasks/recording-contract.ts',
  'apps/web/lib/teleprompter/takes/contract.ts',
  'apps/web/lib/teleprompter/types.ts',
]);
const RECORDING_TAKES_CAPTURE_FILES = new Set([
  'apps/web/app/(marketing)/renders/surfaces/task-recording-takes/page.tsx',
  'apps/web/components/features/teleprompter-studio/StudioTakesSheet.stories.tsx',
  'apps/web/components/features/teleprompter-studio/StudioTakesSheet.tsx',
  'apps/web/lib/screen-cert/RecordingTakesRenderFixture.tsx',
  'apps/web/lib/teleprompter/takes/client.ts',
]);

const RELEASE_ASSIGNEE_CAPTURE_FILES = new Set([
  'apps/web/app/(marketing)/renders/surfaces/external-task-assignee/page.tsx',
  'apps/web/components/features/dashboard/release-tasks/ReleaseTaskAssigneeBadge.stories.tsx',
  'apps/web/components/features/dashboard/release-tasks/ReleaseTaskAssigneeBadge.tsx',
  'apps/web/lib/release-tasks/types.ts',
  'apps/web/lib/screen-cert/ExternalAssigneeRenderFixture.tsx',
]);

// DashboardNav chrome is visible in the existing loaded /app/chat shell.
const DASHBOARD_NAV_FILE =
  'apps/web/components/features/dashboard/dashboard-nav/DashboardNav.tsx';
// These client dependencies affect states the empty-shell producer cannot
// prove. Select the real route, but retain an explicit missing-state failure
// until a stateful producer exists; a generic screenshot must not clear it.
const CHAT_PRESENTATION_STATES = new Map([
  ['apps/web/lib/chat/message-text.ts', 'chat-populated-thread'],
  ['apps/web/lib/chat/new-chat-intent.ts', 'chat-conversation-reset'],
  ['apps/web/lib/chat/tool-ui-registry.ts', 'chat-tool-result'],
]);

/**
 * Authenticated `/app/chat` capture is for visual chat/shell surfaces.
 * API handlers, server turn execution, and onboarding helpers share the
 * "chat" path token but are not the workspace chrome the fixture proves.
 * App Router `(shell)` is a route group, not chat chrome; real chat pages
 * under that group still match `/chat/i`.
 */
function isAuthenticatedChatUiChange(file) {
  if (!/chat|shell/i.test(file)) return false;
  if (/onboarding/i.test(file)) return false;
  if (/^apps\/web\/(app\/api\/|lib\/)/.test(file)) return false;
  if (/\(shell\)/.test(file) && !/chat/i.test(file)) return false;
  return true;
}

export function routeChangedFiles(files) {
  const changed = files.filter(
    file =>
      !UNIT_TEST_FILE.test(file) &&
      !NON_RENDERING_FILES.has(file) &&
      (UI_FILE.test(file) ||
        NATIVE_UI_FILE.test(file) ||
        PUBLIC_CARD_CAPTURE_FILE.test(file) ||
        AUTHENTICATED_SHELL_CAPTURE_FILE.test(file) ||
        /(^|\/)DESIGN\.md$/.test(file))
  );
  if (changed.length === 0)
    return {
      shouldReview: false,
      routes: [],
      reason: 'no-ui-change',
      review_status: 'skipped',
    };
  const routes = new Set();
  const missingCoverage = [];
  for (const file of changed) {
    if (ACCOUNT_CAPTURE_FILES.has(file)) {
      routes.add(ACCOUNT_CAPTURE_ROUTE);
      continue;
    }
    if (TASKS_CAPTURE_FILES.has(file)) {
      routes.add(TASKS_CAPTURE_ROUTE);
      // Product B/C change this shared fixture together with their real UI.
      if (
        file ===
        'apps/web/app/app/(shell)/dashboard/tasks/_lib/screen-cert-fixture.ts'
      ) {
        routes.add(RECORDING_TASK_CAPTURE_ROUTE);
        routes.add(EXTERNAL_TASK_CAPTURE_ROUTE);
      }
      continue;
    }
    if (RECORDING_TASK_CAPTURE_FILES.has(file)) {
      routes.add(RECORDING_TASK_CAPTURE_ROUTE);
      continue;
    }
    if (RECORDING_HOST_CAPTURE_FILES.has(file)) {
      routes.add(RECORDING_HOST_CAPTURE_ROUTE);
      continue;
    }
    if (RECORDING_TAKES_CAPTURE_FILES.has(file)) {
      routes.add(RECORDING_TAKES_CAPTURE_ROUTE);
      continue;
    }
    if (
      file ===
      'apps/web/components/features/dashboard/tasks/task-presentation.ts'
    ) {
      routes.add(EXTERNAL_TASK_CAPTURE_ROUTE);
      continue;
    }
    if (RELEASE_ASSIGNEE_CAPTURE_FILES.has(file)) {
      routes.add(RELEASE_ASSIGNEE_CAPTURE_ROUTE);
      continue;
    }
    const requiredState = CHAT_PRESENTATION_STATES.get(file);
    if (requiredState) {
      routes.add(AUTHENTICATED_CHAT_CAPTURE_ROUTE);
      missingCoverage.push({
        file,
        reason: 'missing-state-producer',
        requiredState,
      });
    } else if (file === DASHBOARD_NAV_FILE)
      routes.add(AUTHENTICATED_CHAT_CAPTURE_ROUTE);
    else if (PUBLIC_CARD_CAPTURE_FILE.test(file))
      routes.add(PUBLIC_CARD_CAPTURE_ROUTE);
    else if (CONTACTS_CAPTURE_FILE.test(file))
      routes.add(CONTACTS_CAPTURE_ROUTE);
    else if (AUTHENTICATED_SHELL_CAPTURE_FILE.test(file))
      routes.add(AUTHENTICATED_CHAT_CAPTURE_ROUTE);
    else if (NATIVE_UI_FILE.test(file) || /admin|console|ops/i.test(file))
      missingCoverage.push({ file, reason: 'unsupported-surface' });
    else if (/dynamic|profile|username|artist/i.test(file))
      routes.add(PUBLIC_PROFILE_CAPTURE_ROUTE);
    else if (isAuthenticatedChatUiChange(file))
      routes.add(AUTHENTICATED_CHAT_CAPTURE_ROUTE);
    else if (
      /^apps\/web\/(?:app\/(?!\((?:marketing|home)\)\/)|lib\/|components\/features\/)/.test(
        file
      )
    )
      missingCoverage.push({ file, reason: 'unsupported-surface' });
    else routes.add(PUBLIC_HOME_CAPTURE_ROUTE);
  }
  return {
    shouldReview: true,
    routes: [...routes].sort((a, b) => a.localeCompare(b)),
    reason: 'ui-change',
    review_status: missingCoverage.length ? 'unavailable' : 'advisory',
    ...(missingCoverage.length ? { missingCoverage } : {}),
  };
}

/** Prove the actual populated Contacts table and selected detail rail.
 * Uses the existing reserved screen-cert fixture served by the real app API;
 * this never intercepts a response or edits/saves a contact.
 */
export async function prepareContactsCapture(page, { timeout = 30_000 } = {}) {
  const visible = locator => locator.filter({ visible: true }).first();
  await visible(page.getByTestId('contacts-workspace')).waitFor({
    state: 'visible',
    timeout,
  });
  const table = visible(page.getByTestId('contacts-table'));
  await table.waitFor({ state: 'visible', timeout });
  await visible(
    table
      .getByTestId('contacts-toolbar-count')
      .filter({ hasText: /^[1-9]\d* contacts?$/ })
  ).waitFor({ state: 'visible', timeout });
  const row = table
    .getByRole('row')
    .filter({ has: page.getByRole('cell') })
    .first();
  const identity = row
    .locator('[data-table-person-cell] .system-b-table-primary-text')
    .first();
  await identity.waitFor({ state: 'visible', timeout });
  const selectedContact = (await identity.innerText()).trim();
  if (!selectedContact)
    throw new Error(
      'Contacts coverage unavailable: populated contact identity missing'
    );
  await row.click({ timeout });
  const header = visible(page.getByTestId('contact-detail-entity-header'));
  await header.waitFor({ state: 'visible', timeout });
  await header
    .getByText(selectedContact, { exact: true })
    .first()
    .waitFor({ state: 'visible', timeout });
  return { state: 'contacts-selected-detail', selectedContact };
}
