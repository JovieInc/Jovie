import { afterEach, describe, expect, it, vi } from 'vitest';
import { installRuntimeAutomationBypass } from '../../e2e/utils/runtime-automation-bypass';

describe('installRuntimeAutomationBypass', () => {
  afterEach(() => {
    delete document.documentElement?.dataset.e2eMode;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('marks an existing document root without constructing an observer', () => {
    const MutationObserverSpy = vi.fn();
    vi.stubGlobal('MutationObserver', MutationObserverSpy);

    installRuntimeAutomationBypass();

    expect(document.documentElement.dataset.e2eMode).toBe('1');
    expect(MutationObserverSpy).not.toHaveBeenCalled();
  });

  it('marks a document root inserted after init and disconnects its observer', async () => {
    const originalRoot = document.documentElement;
    originalRoot.remove();
    expect(document.documentElement).toBeNull();

    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');

    try {
      installRuntimeAutomationBypass();
      expect(disconnect).not.toHaveBeenCalled();

      document.append(originalRoot);

      await vi.waitFor(() => {
        expect(document.documentElement?.dataset.e2eMode).toBe('1');
        expect(disconnect).toHaveBeenCalledOnce();
      });
    } finally {
      if (!document.documentElement) document.append(originalRoot);
    }
  });
});
