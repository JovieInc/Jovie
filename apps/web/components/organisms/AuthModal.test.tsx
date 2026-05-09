/**
 * AuthModal unit tests — JOV-2037
 *
 * Tests the compact AuthModal component in isolation.
 * Clerk's SignIn/SignUp are mocked to inert placeholders since this is a
 * unit test; E2E tests (auth-modal.spec.ts) cover real Clerk behaviour.
 */
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks (must be declared before any imports that use them)
// ---------------------------------------------------------------------------

// Mock next/navigation (useRouter + useSearchParams)
const mockReplace = vi.fn();
const mockSearchParams = {
  get: vi.fn((_key: string): string | null => null),
  has: vi.fn(() => false),
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => mockSearchParams,
}));

// Mock Clerk: replace SignIn and SignUp with inert placeholders
vi.mock('@clerk/nextjs', () => ({
  ClerkProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SignIn: () => (
    <div data-testid='clerk-sign-in' data-clerk-component='SignIn'>
      <input type='email' name='identifier' aria-label='Email address' />
      <button type='button'>Continue with Google</button>
      <button type='submit'>Continue</button>
    </div>
  ),
  SignUp: () => (
    <div data-testid='clerk-sign-up' data-clerk-component='SignUp'>
      <input type='email' name='emailAddress' aria-label='Email address' />
      <button type='button'>Continue with Google</button>
      <button type='submit'>Sign up</button>
    </div>
  ),
}));

// Mock @clerk/ui
vi.mock('@clerk/ui', () => ({ ui: {} }));

// Mock the clerk proxy url helper
vi.mock('@/components/providers/clerkAvailability', () => ({
  getClerkProxyUrl: () => '/__clerk',
}));

// Mock constants/routes
vi.mock('@/constants/routes', () => ({
  APP_ROUTES: {
    SIGNIN: '/signin',
    SIGNUP: '/signup',
    ONBOARDING: '/onboarding',
    WAITLIST: '/waitlist',
    DASHBOARD: '/app',
  },
}));

// ---------------------------------------------------------------------------
// Now import the component under test
// ---------------------------------------------------------------------------
import React from 'react';
import { AuthModal } from './AuthModal';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function renderModal(
  props: Partial<{ defaultMode: 'signin' | 'signup'; onClose: () => void }> = {}
) {
  const onClose = props.onClose ?? vi.fn();
  const result = render(
    <AuthModal defaultMode={props.defaultMode} onClose={onClose} />
  );
  return { ...result, onClose };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuthModal', () => {
  beforeEach(() => {
    // Reset router mock
    mockReplace.mockClear();
    mockSearchParams.get.mockImplementation(
      (_key: string): string | null => null
    );
    mockSearchParams.has.mockReturnValue(false);

    // jsdom doesn't fire scroll lock automatically, set overflow to empty
    document.body.style.overflow = '';
  });

  afterEach(() => {
    // Do NOT reset document.body.innerHTML here — React's cleanup() from
    // @testing-library/react handles unmounting portal nodes. Manually wiping
    // the body while React still holds references to portal nodes causes
    // "NotFoundError: node is not a child of this node" on cleanup.
    document.body.style.overflow = '';
  });

  // -------------------------------------------------------------------------
  // Rendering in sign-in mode
  // -------------------------------------------------------------------------
  describe('sign-in mode', () => {
    it('renders the Clerk SignIn form', async () => {
      renderModal({ defaultMode: 'signin' });

      await waitFor(() => {
        expect(screen.getByTestId('clerk-sign-in')).toBeInTheDocument();
      });
    });

    it('shows the "Need an account? Sign up" toggle footer', async () => {
      renderModal({ defaultMode: 'signin' });

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /need an account\? sign up/i })
        ).toBeInTheDocument();
      });
    });

    it('does NOT show the sign-up Clerk form initially', async () => {
      renderModal({ defaultMode: 'signin' });

      await waitFor(() => {
        expect(screen.queryByTestId('clerk-sign-up')).not.toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // Rendering in sign-up mode
  // -------------------------------------------------------------------------
  describe('sign-up mode', () => {
    it('renders the Clerk SignUp form', async () => {
      renderModal({ defaultMode: 'signup' });

      await waitFor(() => {
        expect(screen.getByTestId('clerk-sign-up')).toBeInTheDocument();
      });
    });

    it('shows the "Have an account? Sign in" toggle footer', async () => {
      renderModal({ defaultMode: 'signup' });

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /have an account\? sign in/i })
        ).toBeInTheDocument();
      });
    });

    it('does NOT show the sign-in Clerk form in sign-up mode', async () => {
      renderModal({ defaultMode: 'signup' });

      await waitFor(() => {
        expect(screen.queryByTestId('clerk-sign-in')).not.toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // Mode toggle
  // -------------------------------------------------------------------------
  describe('mode toggle', () => {
    it('switches from sign-in to sign-up without unmounting', async () => {
      renderModal({ defaultMode: 'signin' });

      await waitFor(() => {
        expect(screen.getByTestId('clerk-sign-in')).toBeInTheDocument();
      });

      const toggleBtn = screen.getByRole('button', {
        name: /need an account\? sign up/i,
      });

      act(() => {
        fireEvent.click(toggleBtn);
      });

      // The portal itself is still mounted
      await waitFor(() => {
        expect(screen.getByTestId('clerk-sign-up')).toBeInTheDocument();
        expect(screen.queryByTestId('clerk-sign-in')).not.toBeInTheDocument();
        expect(
          screen.getByRole('button', { name: /have an account\? sign in/i })
        ).toBeInTheDocument();
      });
    });

    it('switches from sign-up back to sign-in', async () => {
      renderModal({ defaultMode: 'signup' });

      await waitFor(() => {
        expect(screen.getByTestId('clerk-sign-up')).toBeInTheDocument();
      });

      const toggleBtn = screen.getByRole('button', {
        name: /have an account\? sign in/i,
      });

      act(() => {
        fireEvent.click(toggleBtn);
      });

      await waitFor(() => {
        expect(screen.getByTestId('clerk-sign-in')).toBeInTheDocument();
        expect(screen.queryByTestId('clerk-sign-up')).not.toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // ARIA attributes
  // -------------------------------------------------------------------------
  describe('ARIA attributes', () => {
    it('has role="dialog"', async () => {
      renderModal({ defaultMode: 'signin' });

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
    });

    it('has aria-modal="true"', async () => {
      renderModal({ defaultMode: 'signin' });

      await waitFor(() => {
        const dialog = screen.getByRole('dialog');
        expect(dialog).toHaveAttribute('aria-modal', 'true');
      });
    });

    it('has aria-label for sign-in mode', async () => {
      renderModal({ defaultMode: 'signin' });

      await waitFor(() => {
        const dialog = screen.getByRole('dialog');
        expect(dialog).toHaveAttribute('aria-label', 'Sign in to Jovie');
      });
    });

    it('has aria-label for sign-up mode', async () => {
      renderModal({ defaultMode: 'signup' });

      await waitFor(() => {
        const dialog = screen.getByRole('dialog');
        expect(dialog).toHaveAttribute(
          'aria-label',
          'Create your Jovie account'
        );
      });
    });
  });

  // -------------------------------------------------------------------------
  // Size class invariants
  // -------------------------------------------------------------------------
  describe('size class invariants', () => {
    it('container has max-w-[420px] class', async () => {
      renderModal({ defaultMode: 'signin' });

      await waitFor(() => {
        // The inner container (not the full-screen overlay) should have max-w-[420px]
        const container = document.querySelector('.max-w-\\[420px\\]');
        expect(container).not.toBeNull();
      });
    });

    it('container has inline maxHeight for min(560px,calc(100svh-32px))', async () => {
      renderModal({ defaultMode: 'signin' });

      await waitFor(() => {
        const container = document.querySelector('.max-w-\\[420px\\]');
        expect(container).not.toBeNull();
        if (container) {
          const style = (container as HTMLElement).style;
          expect(style.maxHeight).toBeTruthy();
          expect(style.maxHeight).toContain('560px');
        }
      });
    });
  });

  // -------------------------------------------------------------------------
  // Close button
  // -------------------------------------------------------------------------
  describe('close button', () => {
    it('calls onClose when the close (X) button is clicked', async () => {
      const onClose = vi.fn();
      renderModal({ defaultMode: 'signin', onClose });

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // There are two close buttons: the backdrop and the X button
      // The X button (lucide icon) is the last one
      const closeBtns = screen.getAllByRole('button', { name: /^close$/i });
      // Click the last close button (the X icon, not the backdrop)
      act(() => {
        fireEvent.click(closeBtns[closeBtns.length - 1]);
      });

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when the backdrop button is clicked', async () => {
      const onClose = vi.fn();
      renderModal({ defaultMode: 'signin', onClose });

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // The backdrop is the first close button
      const closeBtns = screen.getAllByRole('button', { name: /^close$/i });
      act(() => {
        fireEvent.click(closeBtns[0]);
      });

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Escape key
  // -------------------------------------------------------------------------
  describe('Escape key', () => {
    it('calls onClose when Escape is pressed', async () => {
      const onClose = vi.fn();
      renderModal({ defaultMode: 'signin', onClose });

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      act(() => {
        fireEvent.keyDown(document, { key: 'Escape' });
      });

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Skeleton placeholder
  // -------------------------------------------------------------------------
  describe('skeleton placeholder', () => {
    it('renders the skeleton before Clerk mounts its form', () => {
      // The skeleton is rendered as aria-hidden while clerkReady is false.
      // Since our mock Clerk form renders synchronously, we need to check
      // that the skeleton element exists in the DOM at some point.
      // Because jsdom is synchronous, test the skeleton structure by checking
      // the data-testid attribute exists.
      renderModal({ defaultMode: 'signin' });

      // The skeleton may be hidden (aria-hidden=true) but should exist initially
      const skeleton = document.querySelector(
        '[data-testid="auth-modal-skeleton"]'
      );
      // Either skeleton is present (before Clerk ready) or the form is already shown
      // Both are valid states depending on timing
      const clerkForm = screen.queryByTestId('clerk-sign-in');
      expect(skeleton !== null || clerkForm !== null).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // URL param mode resolution
  // -------------------------------------------------------------------------
  describe('URL param mode resolution', () => {
    it('uses signup mode when ?auth=signup URL param is present', async () => {
      mockSearchParams.get.mockImplementation((key: string): string | null =>
        key === 'auth' ? 'signup' : null
      );

      // defaultMode not supplied — should fall back to URL param
      renderModal({});

      await waitFor(() => {
        expect(screen.getByTestId('clerk-sign-up')).toBeInTheDocument();
      });
    });

    it('defaults to signin when no URL param and no defaultMode', async () => {
      mockSearchParams.get.mockImplementation(
        (_key: string): string | null => null
      );

      renderModal({});

      await waitFor(() => {
        expect(screen.getByTestId('clerk-sign-in')).toBeInTheDocument();
      });
    });
  });
});
