import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { toJovieUser } from '@/lib/auth/jovie-user';
import {
  JovieAuthDefaultsProvider,
  useAuthSafe,
  useCanRenderAuthUi,
  useUserSafe,
} from './useJovieAuth';

const useSession = vi.fn();
vi.mock('@/lib/auth/client', () => ({
  authClient: { useSession: () => useSession() },
}));

describe('local auth identity fixture', () => {
  it('preserves signed-out safe defaults', () => {
    const { result } = renderHook(useUserSafe, {
      wrapper: JovieAuthDefaultsProvider,
    });
    expect(result.current).toEqual({
      isLoaded: true,
      isSignedIn: false,
      user: null,
    });
  });

  it('renders a deterministic identity without session, token or auth UI authority', async () => {
    const user = toJovieUser({
      id: 'demo',
      name: 'Tim White',
      image: '/images/avatars/tim-white.jpg',
      email: '',
    });
    const { result } = renderHook(
      () => ({
        user: useUserSafe(),
        auth: useAuthSafe(),
        canRender: useCanRenderAuthUi(),
      }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <JovieAuthDefaultsProvider fixtureUser={user}>
            {children}
          </JovieAuthDefaultsProvider>
        ),
      }
    );
    expect(result.current.user.user).toBe(user);
    expect(result.current.user.isSignedIn).toBe(false);
    expect(result.current.auth.isSignedIn).toBe(false);
    expect(result.current.auth.userId).toBeNull();
    expect(await result.current.auth.getToken()).toBeNull();
    expect(result.current.canRender).toBe(false);
    expect(useSession).not.toHaveBeenCalled();
  });
});
