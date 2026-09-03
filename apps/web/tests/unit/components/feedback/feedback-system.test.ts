import { readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSonnerToast } = vi.hoisted(() => ({
  mockSonnerToast: Object.assign(vi.fn().mockReturnValue('toast-id'), {
    success: vi.fn().mockReturnValue('success-id'),
    error: vi.fn().mockReturnValue('error-id'),
    warning: vi.fn().mockReturnValue('warning-id'),
    info: vi.fn().mockReturnValue('info-id'),
    message: vi.fn().mockReturnValue('message-id'),
    loading: vi.fn().mockReturnValue('loading-id'),
    dismiss: vi.fn(),
    promise: vi.fn(),
    custom: vi.fn(),
  }),
}));

vi.mock('sonner', () => ({ toast: mockSonnerToast }));

import { banner } from '@/components/feedback/banner-store';
import {
  getFeedbackErrorMessage,
  TOAST_DURATIONS,
  toast,
} from '@/components/feedback/toast';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

const DIRECT_SONNER_IMPORT_PATTERN = /\bfrom\s+['"]sonner['"]/;
const ALLOWED_SONNER_IMPORT_OWNERS = new Set([
  'components/feedback/FeedbackProvider.tsx',
  'components/feedback/toast.ts',
]);

function shouldScanSourceFile(filePath: string): boolean {
  if (!(filePath.endsWith('.ts') || filePath.endsWith('.tsx'))) return false;
  if (filePath.endsWith('.d.ts')) return false;
  if (/\.(test|spec|stories)\.[cm]?[tj]sx?$/.test(filePath)) return false;
  return true;
}

function findDirectSonnerImportsInSource(
  relativePath: string,
  source: string
): string[] {
  if (ALLOWED_SONNER_IMPORT_OWNERS.has(relativePath)) return [];
  if (!DIRECT_SONNER_IMPORT_PATTERN.test(source)) return [];
  return [relativePath];
}

function findDirectSonnerImports(directory: string): string[] {
  const matches: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (
      entry.name === '.next' ||
      entry.name === 'node_modules' ||
      entry.name === 'scripts' ||
      entry.name === 'tests'
    ) {
      continue;
    }

    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      matches.push(...findDirectSonnerImports(entryPath));
      continue;
    }

    if (!shouldScanSourceFile(entryPath)) continue;

    const relativePath = relative(webRoot, entryPath);
    matches.push(
      ...findDirectSonnerImportsInSource(
        relativePath,
        readFileSync(entryPath, 'utf8')
      )
    );
  }

  return matches.sort();
}

describe('canonical toast wrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forwards variant calls to the renderer arity-preserved (no injected options)', () => {
    toast.success('Saved');
    expect(mockSonnerToast.success).toHaveBeenCalledWith('Saved');

    toast.error('Failed');
    expect(mockSonnerToast.error).toHaveBeenCalledWith('Failed');

    toast.info('FYI');
    expect(mockSonnerToast.info).toHaveBeenCalledWith('FYI');
  });

  it('forwards per-call options untouched', () => {
    toast.success('Copied', { duration: TOAST_DURATIONS.SHORT, id: 'copy' });
    expect(mockSonnerToast.success).toHaveBeenCalledWith('Copied', {
      duration: TOAST_DURATIONS.SHORT,
      id: 'copy',
    });
  });

  it('supports base calls and dismiss', () => {
    const id = toast('Plain message');
    expect(mockSonnerToast).toHaveBeenCalledWith('Plain message');
    expect(id).toBe('toast-id');

    toast.dismiss('toast-id');
    expect(mockSonnerToast.dismiss).toHaveBeenCalledWith('toast-id');
  });

  it('keeps the canonical auto-dismiss default within the 3-5s window', () => {
    expect(TOAST_DURATIONS.DEFAULT).toBeGreaterThanOrEqual(3000);
    expect(TOAST_DURATIONS.DEFAULT).toBeLessThanOrEqual(5000);
  });
});

describe('canonical toast ownership', () => {
  it('detects a direct renderer import outside the feedback owner', () => {
    expect(
      findDirectSonnerImportsInSource(
        'components/features/example/BadToast.tsx',
        "import { toast } from 'sonner';\n\ntoast.success('Saved');\n"
      )
    ).toEqual(['components/features/example/BadToast.tsx']);
  });

  it('keeps production toast calls behind the feedback API', () => {
    expect(findDirectSonnerImports(webRoot)).toEqual([]);
  });
});

describe('canonical banner store', () => {
  beforeEach(() => {
    banner.dismiss();
    vi.clearAllMocks();
  });

  it('shows banners with an info default variant and returns an id', () => {
    const id = banner.show({ title: 'Maintenance tonight' });

    const items = banner.getBanners();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id,
      title: 'Maintenance tonight',
      variant: 'info',
    });
  });

  it('supports success, warning, error, and info shortcuts', () => {
    banner.success('Import complete');
    banner.warning('Import delayed');
    banner.error('Payments degraded');
    banner.info('New feature available');

    const variants = banner.getBanners().map(item => item.variant);
    expect(variants).toEqual(['success', 'warning', 'error', 'info']);
  });

  it('persists until dismissed and dismisses by id', () => {
    const first = banner.info('First');
    banner.info('Second');
    expect(banner.getBanners()).toHaveLength(2);

    banner.dismiss(first);
    const remaining = banner.getBanners();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.title).toBe('Second');

    banner.dismiss();
    expect(banner.getBanners()).toHaveLength(0);
  });

  it('dedupes repeat announcements by stable id', () => {
    banner.show({ id: 'status', title: 'Degraded' });
    banner.show({ id: 'status', title: 'Recovering', variant: 'success' });

    const items = banner.getBanners();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'status',
      title: 'Recovering',
      variant: 'success',
    });
  });

  it('notifies subscribers on change and supports unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = banner.subscribe(listener);

    banner.info('Hello');
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    banner.info('World');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('auto-dismisses when durationMs is provided', () => {
    vi.useFakeTimers();
    try {
      banner.show({ title: 'Ephemeral', durationMs: 1000 });
      expect(banner.getBanners()).toHaveLength(1);

      vi.advanceTimersByTime(1001);
      expect(banner.getBanners()).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('getFeedbackErrorMessage', () => {
  it('passes through short human-readable strings and Error messages', () => {
    expect(getFeedbackErrorMessage('Username taken')).toBe('Username taken');
    expect(getFeedbackErrorMessage(new Error('Please sign in again.'))).toBe(
      'Please sign in again.'
    );
  });

  it('falls back to a generic message for technical or verbose errors', () => {
    const fallback = 'Something went wrong. Please try again.';
    expect(getFeedbackErrorMessage(new TypeError('x is not a function'))).toBe(
      fallback
    );
    expect(getFeedbackErrorMessage(new Error('a'.repeat(200)))).toBe(fallback);
    expect(getFeedbackErrorMessage(undefined)).toBe(fallback);
    expect(getFeedbackErrorMessage(null, 'Custom fallback')).toBe(
      'Custom fallback'
    );
  });
});
