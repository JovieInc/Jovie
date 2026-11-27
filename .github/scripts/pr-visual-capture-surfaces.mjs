const UI_FILE =
  /^(apps\/web\/(app|components|features|lib|public|styles|tests\/visual-qa)|packages\/ui|apps\/console\/.*screenshot|apps\/ios\/.*(View|Screen|Snapshot)|.*\.(css|scss|tsx|jsx))\//;
export const PUBLIC_HOME_CAPTURE_ROUTE = '/';
const PUBLIC_CARD_CAPTURE_ROUTE = '/card';
const PUBLIC_CARD_CAPTURE_FILE =
  /^(?:apps\/web\/app\/\(marketing\)\/card\/|apps\/web\/data\/jovieCardCopy\.ts$)/;
export const PUBLIC_PROFILE_CAPTURE_ROUTE = '/demo/showcase/public-profile';
export const AUTHENTICATED_CHAT_CAPTURE_ROUTE = '/app/chat';
export const CONTACTS_CAPTURE_ROUTE = '/app/contacts';
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
      UI_FILE.test(file) ||
      NATIVE_UI_FILE.test(file) ||
      PUBLIC_CARD_CAPTURE_FILE.test(file) ||
      AUTHENTICATED_SHELL_CAPTURE_FILE.test(file) ||
      /(^|\/)DESIGN\.md$/.test(file)
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
    if (PUBLIC_CARD_CAPTURE_FILE.test(file))
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
