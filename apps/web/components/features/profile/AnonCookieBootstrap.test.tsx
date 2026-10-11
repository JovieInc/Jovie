import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnonCookieBootstrap } from './AnonCookieBootstrap';

function mockFetch(
  impl: () => Promise<Partial<Response>>
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('AnonCookieBootstrap', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not fetch when no callbacks are registered', () => {
    const fetchMock = mockFetch(() => Promise.resolve({ ok: true }));

    render(<AnonCookieBootstrap />);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('delivers the resolved variant and settles resolution on success', async () => {
    const onVariantResolved = vi.fn();
    const onProfilePacResolved = vi.fn();
    const onResolved = vi.fn();
    const fetchMock = mockFetch(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            alertOptInVariant: 'toggle',
            profilePac: {
              copyArm: 'alternate',
              triggerThreshold: '30s',
              s2Slot: 'merch',
              tabBar: 'visible',
              dismissAffordance: 'text',
            },
          }),
      })
    );

    render(
      <AnonCookieBootstrap
        onVariantResolved={onVariantResolved}
        onProfilePacResolved={onProfilePacResolved}
        onResolved={onResolved}
      />
    );

    await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/profile/audience-anon-cookie',
      expect.objectContaining({ credentials: 'same-origin' })
    );
    expect(onVariantResolved).toHaveBeenCalledWith('toggle');
    expect(onProfilePacResolved).toHaveBeenCalledWith({
      copyArm: 'alternate',
      triggerThreshold: '30s',
      s2Slot: 'merch',
      tabBar: 'visible',
      dismissAffordance: 'text',
    });
  });

  it('settles resolution even when the response is not OK', async () => {
    const onVariantResolved = vi.fn();
    const onResolved = vi.fn();
    mockFetch(() => Promise.resolve({ ok: false }));

    render(
      <AnonCookieBootstrap
        onVariantResolved={onVariantResolved}
        onResolved={onResolved}
      />
    );

    await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(1));
    expect(onVariantResolved).not.toHaveBeenCalled();
  });

  it('settles resolution when the fetch rejects', async () => {
    const onResolved = vi.fn();
    mockFetch(() => Promise.reject(new Error('network down')));

    render(<AnonCookieBootstrap onResolved={onResolved} />);

    await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(1));
  });
});
