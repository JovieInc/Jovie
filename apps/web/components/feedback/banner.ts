'use client';

/**
 * Canonical banner store for Jovie.
 *
 * Banners are the persistent half of the feedback system: system status
 * and announcements pinned to the top of the viewport until dismissed
 * (toasts are the ephemeral half — see `./toast`). The store is a tiny
 * module-level pub/sub consumed by `BannerViewport` via
 * `useSyncExternalStore`; no extra state library needed.
 *
 * @example
 * ```tsx
 * import { banner } from '@/components/feedback';
 *
 * banner.info('Scheduled maintenance tonight at 10pm PT');
 * banner.error('Payments are degraded', {
 *   description: 'Checkout may fail intermittently. We are on it.',
 * });
 * const id = banner.success('Import complete');
 * banner.dismiss(id);
 * ```
 */

export type BannerVariant = 'success' | 'error' | 'info';

export interface BannerAction {
  label: string;
  onClick?: () => void;
  href?: string;
}

export interface BannerItem {
  id: string;
  variant: BannerVariant;
  title: string;
  description?: string;
  action?: BannerAction;
  /**
   * Optional auto-dismiss (ms). Banners are persistent until dismissed by
   * default — prefer toasts for anything ephemeral.
   */
  durationMs?: number;
}

export interface BannerInput extends Omit<BannerItem, 'id' | 'variant'> {
  /** Stable id to dedupe repeat announcements (re-showing replaces). */
  id?: string;
  variant?: BannerVariant;
}

let banners: readonly BannerItem[] = [];
const listeners = new Set<() => void>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let counter = 0;

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

function clearTimer(id: string): void {
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
}

function show(input: BannerInput): string {
  counter += 1;
  const id = input.id ?? `banner-${counter}`;
  const item: BannerItem = { variant: 'info', ...input, id };
  clearTimer(id);
  banners = [...banners.filter(existing => existing.id !== id), item];
  if (item.durationMs && Number.isFinite(item.durationMs)) {
    timers.set(
      id,
      setTimeout(() => dismiss(id), item.durationMs)
    );
  }
  emit();
  return id;
}

function dismiss(id?: string): void {
  if (id === undefined) {
    for (const bannerId of timers.keys()) {
      clearTimer(bannerId);
    }
    banners = [];
  } else {
    clearTimer(id);
    banners = banners.filter(existing => existing.id !== id);
  }
  emit();
}

type BannerShortcutOptions = Omit<BannerInput, 'title' | 'variant'>;

/** Canonical banner API. */
export const banner = {
  show,
  dismiss,
  success: (title: string, options?: BannerShortcutOptions): string =>
    show({ ...options, title, variant: 'success' }),
  error: (title: string, options?: BannerShortcutOptions): string =>
    show({ ...options, title, variant: 'error' }),
  info: (title: string, options?: BannerShortcutOptions): string =>
    show({ ...options, title, variant: 'info' }),
  /** Subscribe to store changes. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  /** Stable snapshot of active banners (for useSyncExternalStore). */
  getBanners: (): readonly BannerItem[] => banners,
};
