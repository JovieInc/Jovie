/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isOnboardingLocalAutomationBypassRuntime } from './onboardingAutomationBypass';

describe('isOnboardingLocalAutomationBypassRuntime', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete document.documentElement.dataset.e2eMode;
  });

  it('returns false when document is unavailable', () => {
    vi.stubGlobal('document', undefined);

    expect(isOnboardingLocalAutomationBypassRuntime()).toBe(false);
  });

  it('returns true only when data-e2e-mode is 1', () => {
    document.documentElement.dataset.e2eMode = '1';
    expect(isOnboardingLocalAutomationBypassRuntime()).toBe(true);

    document.documentElement.dataset.e2eMode = '0';
    expect(isOnboardingLocalAutomationBypassRuntime()).toBe(false);

    delete document.documentElement.dataset.e2eMode;
    expect(isOnboardingLocalAutomationBypassRuntime()).toBe(false);
  });
});
