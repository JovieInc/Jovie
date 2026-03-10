import { describe, expect, it, vi } from 'vitest';
import { withTimeoutFallback } from '@/lib/featured-creators';

describe('withTimeoutFallback', () => {
  it('returns fallback and invokes timeout handler when promise hangs', async () => {
    const onTimeout = vi.fn();
    const never = new Promise<string>(() => {
      // Intentionally unresolved promise for timeout behavior
    });

    const result = await withTimeoutFallback(never, 10, 'fallback', onTimeout);

    expect(result).toBe('fallback');
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('returns resolved value and does not invoke timeout handler', async () => {
    const onTimeout = vi.fn();

    const result = await withTimeoutFallback(
      Promise.resolve('ok'),
      50,
      'fallback',
      onTimeout
    );

    expect(result).toBe('ok');
    expect(onTimeout).not.toHaveBeenCalled();
  });
});
