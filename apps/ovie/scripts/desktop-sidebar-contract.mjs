/** Source guard supplements the real SSR/hydration and rendered CSS regressions. */
export function validateDesktopSidebarContract(authShell, header, css) {
  const violations = [];
  if (
    !/const\s+isElectron\s*=\s*useIsElectronRuntime\(\)/.test(authShell) ||
    /\bisElectronRuntime\s*\(/.test(authShell) ||
    !/sidebarTrigger\s*=\s*[^;]*\bisElectron\s*\?[^;]*null/.test(authShell)
  ) {
    violations.push(
      'AuthShell: desktop sidebar detection must preserve hydration and remove the web toggle after hydration (JOV-7207)'
    );
  }
  if (
    (header.match(/data-web-sidebar-control=['"]true['"]/g) ?? []).length !== 2
  ) {
    violations.push(
      'DashboardHeader: web toggle and divider both require the desktop hiding marker (JOV-7207)'
    );
  }
  if (
    !/html\[data-desktop-runtime=['"]electron['"]\]\s+\[data-web-sidebar-control=['"]true['"]\]\s*\{[^}]*display:\s*none\s*;/.test(
      css
    )
  ) {
    violations.push(
      'globals.css: hide the web sidebar controls before Electron hydration (JOV-7207)'
    );
  }
  return violations;
}
