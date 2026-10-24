import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { banner } from './banner-store';

beforeEach(() => banner.dismiss());
afterEach(() => {
  banner.dismiss();
  vi.useRealTimers();
});
describe('canonical notice arbitration', () => {
  it('deduplicates, preempts and resumes actionable notices in priority/FIFO order', () => {
    const action = { label: 'Install', onClick: vi.fn() };
    banner.show({
      id: 'install',
      title: 'Install',
      action,
      priority: 0,
      placement: 'sidebar',
    });
    banner.show({
      id: 'update',
      title: 'Update',
      priority: 300,
      placement: 'sidebar',
    });
    banner.warning('Permission needed', { id: 'permission' });
    expect(banner.getActiveBanner()?.id).toBe('permission');
    banner.error('Connection failed', { id: 'error' });
    banner.error('Try reconnecting', { id: 'error' });
    expect(banner.getBanners()).toHaveLength(4);
    expect(banner.getActiveBanner()?.title).toBe('Try reconnecting');
    banner.dismiss('error');
    expect(banner.getActiveBanner()?.id).toBe('permission');
    banner.dismiss('permission');
    expect(banner.getActiveBanner()?.id).toBe('update');
    banner.dismiss('update');
    expect(banner.getActiveBanner()?.action).toBe(action);
    banner.getActiveBanner()?.action?.onClick?.();
    expect(action.onClick).toHaveBeenCalledOnce();
    banner.dismiss('install');
    expect(banner.getActiveBanner()).toBeNull();
  });
  it('does not expire a queued timed notice before it has been selected', () => {
    vi.useFakeTimers();
    banner.error('Offline', { id: 'offline' });
    banner.info('Saved', { id: 'saved', durationMs: 1000 });
    vi.advanceTimersByTime(5000);
    expect(banner.getBanners()).toHaveLength(2);
    banner.dismiss('offline');
    expect(banner.getActiveBanner()?.id).toBe('saved');
    vi.advanceTimersByTime(1001);
    expect(banner.getActiveBanner()).toBeNull();
  });
});
