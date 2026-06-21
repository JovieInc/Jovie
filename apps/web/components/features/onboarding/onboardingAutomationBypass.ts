export function isOnboardingLocalAutomationBypassRuntime(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.dataset.e2eMode === '1';
}
