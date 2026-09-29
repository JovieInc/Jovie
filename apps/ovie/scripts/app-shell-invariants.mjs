import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ovieRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const defaultRepoRoot = path.resolve(ovieRoot, '../..');

async function filesUnder(directory, name = 'page.tsx') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const child = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(child, name)));
    else if (entry.name === name) files.push(child);
  }
  return files.sort();
}

async function source(repoRoot, relativePath) {
  return readFile(path.join(repoRoot, relativePath), 'utf8');
}

function expectSource(violations, file, contents, predicate, message) {
  if (!predicate(contents)) violations.push(`${file}: ${message}`);
}

export function findRepeatedStatusCounts(text) {
  const counts = text.match(/\b\d+\s+of\s+\d+\b/gi) ?? [];
  return [
    ...new Set(
      counts.filter((value, index) => counts.indexOf(value) !== index)
    ),
  ];
}

export async function auditOvieAppShell(repoRoot = defaultRepoRoot) {
  const violations = [];
  const adminRoot = path.join(repoRoot, 'apps/web/app/app/(shell)/admin');
  const pageFiles = await filesUnder(adminRoot);
  const routes = [];

  for (const file of pageFiles) {
    const relative = path.relative(adminRoot, file).replaceAll(path.sep, '/');
    const segment = relative.replace(/\/?page\.tsx$/, '');
    const route = segment.startsWith('wiki')
      ? `/hud/${segment}`
      : `/app/ov${segment ? `/${segment}` : ''}`;
    const contents = await readFile(file, 'utf8');
    const owner = contents.includes('redirect(')
      ? 'redirect'
      : contents.includes('export { default }')
        ? 'shell-adapter'
        : 'operator-shell';
    routes.push({ route, owner, file: path.relative(repoRoot, file) });

    const ownsCanonicalSurface = [
      'AdminPage',
      'redirect(',
      'export { default }',
      'OvieCertificationsWorkspace',
      'OvChatClient',
      'AdminHudPage',
    ].some(marker => contents.includes(marker));
    if (!ownsCanonicalSurface) {
      violations.push(
        `${path.relative(repoRoot, file)}: route must use a certified shell surface`
      );
    }

    if (/<h1\b/.test(contents)) {
      violations.push(
        `${path.relative(repoRoot, file)}: route duplicates the shell h1`
      );
    }
    if (/\bPageHeader\b/.test(contents)) {
      violations.push(
        `${path.relative(repoRoot, file)}: route owns PageHeader instead of shell chrome`
      );
    }
    for (const duplicate of findRepeatedStatusCounts(contents)) {
      violations.push(
        `${path.relative(repoRoot, file)}: repeats status/count "${duplicate}"`
      );
    }
  }

  for (const file of await filesUnder(adminRoot, 'loading.tsx')) {
    const contents = await readFile(file, 'utf8');
    if (/<h1\b/.test(contents) || /\bPageHeader\b/.test(contents)) {
      violations.push(
        `${path.relative(repoRoot, file)}: loading state duplicates shell title chrome`
      );
    }
  }

  routes.push(
    {
      route: '/hud',
      owner: 'operator-shell-or-token-kiosk',
      file: 'apps/web/app/hud/page.tsx',
    },
    {
      route: '/signin',
      owner: 'auth-boundary',
      file: 'apps/ovie/app/signin/page.tsx',
    }
  );

  const required = {
    adminPage: [
      'apps/web/components/features/admin/layout/AdminPage.tsx',
      text =>
        text.includes('<PageToolbar') && !text.includes('admin-page-meta'),
      'AdminPage must put actions in PageToolbar and must not render a meta header',
    ],
    tabs: [
      'apps/web/components/organisms/WorkspaceTabsSurface.tsx',
      text => text.includes('<Link') && !text.includes('location.assign'),
      'tabs must use client routing without reloading the shell',
    ],
    fullscreen: [
      'apps/web/components/features/admin/hud/HudFullscreenControl.tsx',
      text =>
        text.includes('[data-app-shell-main-plane="true"]') &&
        text.includes('requestFullscreen()') &&
        !text.includes('location.assign'),
      'fullscreen must expand the current main-content plane',
    ],
    hud: [
      'apps/web/app/hud/page.tsx',
      text =>
        text.includes('if (tokenOk)') &&
        !text.includes('OvieMacHud') &&
        !text.includes("action='exit'"),
      'only an authenticated kiosk token may bypass AdminPage',
    ],
    table: [
      'apps/web/components/organisms/table/organisms/UnifiedTable.tsx',
      text =>
        text.includes('rowHeight = TABLE_ROW_HEIGHTS.STANDARD') &&
        text.includes("'w-full min-w-0 overflow-auto'"),
      'UnifiedTable must own full width and the canonical fixed row height',
    ],
    cell: [
      'apps/web/components/organisms/table/atoms/TableCell.tsx',
      text =>
        text.includes("data-table-cell-content='stable'") &&
        text.includes('max-h-8') &&
        text.includes('whitespace-nowrap'),
      'table cells must clip copy inside a stable height',
    ],
    rightRail: [
      'apps/web/components/features/admin/certifications/OvieCertificationsWorkspace.tsx',
      text => text.includes('useRegisterRightPanel(rail)'),
      'certification entity detail must register in the right rail',
    ],
    peopleRail: [
      'apps/web/app/app/(shell)/admin/people/page.tsx',
      text => text.includes('<AdminPeopleRightPanelProvider>'),
      'people entity detail must use the shared right-rail provider',
    ],
    sidebar: [
      'apps/web/components/organisms/UnifiedSidebar.tsx',
      text =>
        text.includes('!isDesktop') && text.includes('SidebarCollapseButton'),
      'desktop sidebar must not render a second collapse control',
    ],
    authShellToggle: [
      'apps/web/components/organisms/AuthShell.tsx',
      text =>
        /sidebarTrigger\s*=\s*[^;]*isElectronRuntime\(\)\s*\?[^;]*null/.test(
          text.replaceAll(/\s+/g, ' ')
        ),
      'AuthShell must not pass a second left-sidebar toggle to the header in Electron (JOV-7207)',
    ],
    titlebar: [
      'apps/web/components/atoms/DesktopTitlebar.tsx',
      text =>
        text.includes("data-electron-titlebar='true'") &&
        text.includes('traffic') &&
        text.includes('RailToggleButton'),
      'desktop titlebar must preserve the native traffic-light geometry and use the canonical rail toggle',
    ],
  };

  for (const [file, predicate, message] of Object.values(required)) {
    const contents = await source(repoRoot, file);
    expectSource(violations, file, contents, predicate, message);
  }

  const identitySurfaces = [
    // AdminIngestPageClient.tsx was deleted as orphaned dead code (JOV-6778,
    // #19321): admin/ingest now redirects and never renders it.
    'apps/web/app/app/(shell)/admin/platform-connections/PlatformConnectionsClient.tsx',
  ];
  for (const file of identitySurfaces) {
    const contents = await source(repoRoot, file);
    if (!contents.includes('SpotifyAccountIdentity')) {
      violations.push(`${file}: must use the shared Spotify account identity`);
    }
  }

  const operatorLayout = await source(
    repoRoot,
    'apps/ovie/app/(operator)/layout.tsx'
  );
  const shellOwners = operatorLayout.match(/<DashboardShellContent\b/g) ?? [];
  if (shellOwners.length !== 1 || !operatorLayout.includes("mode='ov'")) {
    violations.push(
      'apps/ovie/app/(operator)/layout.tsx: must own exactly one OV app shell'
    );
  }

  const routeGenerator = await source(repoRoot, 'apps/ovie/scripts/routes.mjs');
  if (!routeGenerator.includes("from === 'hud' && relativeEntry.startsWith")) {
    violations.push(
      'apps/ovie/scripts/routes.mjs: direct HUD projection must exclude shell-owned wiki routes'
    );
  }

  return { violations, routes };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = await auditOvieAppShell();
  if (result.violations.length > 0) {
    console.error(result.violations.join('\n'));
    process.exitCode = 1;
  } else {
    console.log(
      `Ovie app-shell certification passed for ${result.routes.length} UI routes.`
    );
  }
}
