import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AnonCookieBootstrap } from './AnonCookieBootstrap';

// The bootstrap renders nothing in every state, so the evidence is that the
// profile around it stays clean and the CTA gate still opens on failure.
describe('AnonCookieBootstrap: certificate states', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ['offline', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['a server error', () => Promise.resolve({ ok: false })],
  ])(
    'keeps the default variant and settles resolution when %s',
    async (_name, respond) => {
      vi.stubGlobal('fetch', vi.fn(respond));
      const onVariantResolved = vi.fn();
      const onProfilePacResolved = vi.fn();
      const onResolved = vi.fn();

      const { container } = render(
        <section aria-label='Tim White'>
          <h1>Tim White</h1>
          <AnonCookieBootstrap
            onVariantResolved={onVariantResolved}
            onProfilePacResolved={onProfilePacResolved}
            onResolved={onResolved}
          />
        </section>
      );

      await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(1));
      expect(onVariantResolved).not.toHaveBeenCalled();
      expect(onProfilePacResolved).not.toHaveBeenCalled();
      expect(container.querySelector('section')?.children).toHaveLength(1);
      await expectNoA11yViolations(container);
    }
  );
});
