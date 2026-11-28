import { ACCOUNT_CAPTURE_ROUTE } from './pr-visual-capture-surfaces.mjs';

const AUTHENTICATED_SHELL_WAIT_MS = 30_000;
const NEW_CHAT_EMPTY_WAIT_MS = 15_000;
const visible = locator => locator.filter({ visible: true });

function authenticatedShell(page, route) {
  // Settings intentionally has no DashboardHeader. Only the registered
  // account route may prove its exact loaded SettingsSection instead.
  const header =
    route === ACCOUNT_CAPTURE_ROUTE
      ? page
          .getByTestId('settings-shell-content')
          .locator('section[id="account"]')
          .locator('h1')
          .filter({ hasText: /^Account$/ })
      : page.locator('[data-testid="dashboard-header"]');
  // AppShellFrame deliberately omits this marker from streamed placeholders.
  // Scope the header and navigation to the same visible, live frame.
  const frame = visible(page.locator('[data-app-shell-frame="true"]')).filter({
    has: visible(header),
  });
  const desktop = frame.locator('[data-sidebar="sidebar"]').locator('a[href]');
  const mobile = frame
    .locator('[data-mobile-navigation="true"]')
    .locator('nav[aria-label="Dashboard Tabs"]')
    .locator('a[href]');
  const operatorMobile = frame
    .and(page.locator('[data-app-shell-workspace="ov"]'))
    .locator('[data-mobile-navigation="true"]')
    .locator('nav[aria-label="OV Mobile Navigation"]')
    .locator('a[href]');
  return {
    header,
    // A legitimate producer dialog can aria-hide its background. DOM markers
    // still prove painted chrome; CSS-hidden or detached navigation cannot.
    navigation: visible(desktop.or(mobile).or(operatorMobile)),
    greeting: visible(
      frame.locator('h2[data-testid="chat-empty-state-greeting-text"]')
    ),
  };
}

async function rejectDashboardError(page) {
  if (
    (await visible(page.locator('[data-testid="dashboard-error"]')).count()) > 0
  ) {
    throw new Error(
      'Captured app route rendered dashboard error UI instead of authenticated shell'
    );
  }
}

function isChatRoute(route) {
  return route === '/app/chat' || route.startsWith('/app/chat/');
}

/** Wait for loaded chrome, never the initial streaming skeleton. */
export async function waitForAuthenticatedShell(page, route) {
  if (!route.startsWith('/app/')) return;
  const shell = authenticatedShell(page, route);
  await visible(shell.header.or(page.getByTestId('dashboard-error')))
    .first()
    .waitFor({ state: 'visible', timeout: AUTHENTICATED_SHELL_WAIT_MS });
  await rejectDashboardError(page);
  await shell.navigation.first().waitFor({
    state: 'visible',
    timeout: AUTHENTICATED_SHELL_WAIT_MS,
  });
  if (isChatRoute(route)) {
    // JOV-7150: the loading greeting-region has no loaded h2 -text marker.
    await shell.greeting.first().waitFor({
      state: 'visible',
      timeout: NEW_CHAT_EMPTY_WAIT_MS,
    });
  }
}

/** Recheck the same live chrome after the strict route-state producer. */
export async function assertAuthenticatedShell(page, route) {
  if (!route.startsWith('/app/')) return;
  await rejectDashboardError(page);
  const shell = authenticatedShell(page, route);
  if ((await shell.navigation.count()) === 0) {
    throw new Error('Captured app route did not render authenticated shell');
  }
  if (isChatRoute(route) && (await shell.greeting.count()) === 0) {
    throw new Error('Captured chat route did not render its loaded greeting');
  }
}
