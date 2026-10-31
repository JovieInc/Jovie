import { describe, expect, it, vi } from 'vitest';

describe('opaque SDK document isolation', () => {
  it('keeps same-page URL changes but discards SDKs before crossing artist routes', async () => {
    const navigation = {
      href: 'https://jov.ie/first',
      origin: 'https://jov.ie',
      pathname: '/first',
      assign: vi.fn(),
      replace: vi.fn(),
      reload: vi.fn(),
    };
    const originalPush = vi.fn();
    const originalReplace = vi.fn();
    vi.stubGlobal('location', navigation);
    vi.stubGlobal('history', {
      pushState: originalPush,
      replaceState: originalReplace,
    });
    try {
      const { isolateTrackingDocument, resetTrackingDocument } = await import(
        './vendor-navigation'
      );
      resetTrackingDocument();
      expect(navigation.reload).not.toHaveBeenCalled();
      isolateTrackingDocument();
      isolateTrackingDocument();
      history.pushState({}, '', '?tab=links');
      expect(originalPush).toHaveBeenCalledOnce();
      history.pushState({}, '', '/young-artist');
      history.replaceState({}, '', '/young-artist/alerts');
      expect(originalPush).toHaveBeenCalledOnce();
      expect(originalReplace).not.toHaveBeenCalled();
      expect(navigation.assign).toHaveBeenCalledWith(
        'https://jov.ie/young-artist'
      );
      expect(navigation.replace).toHaveBeenCalledWith(
        'https://jov.ie/young-artist/alerts'
      );
      const vendorHistoryListener = vi.fn();
      window.addEventListener('popstate', vendorHistoryListener);
      window.dispatchEvent(new PopStateEvent('popstate'));
      expect(vendorHistoryListener).not.toHaveBeenCalled();
      expect(navigation.reload).toHaveBeenCalledOnce();
      window.removeEventListener('popstate', vendorHistoryListener);
      resetTrackingDocument();
      expect(navigation.reload).toHaveBeenCalledTimes(2);
      navigation.pathname = '/app/dashboard';
      history.pushState({}, '', '/app/settings');
      expect(originalPush).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
