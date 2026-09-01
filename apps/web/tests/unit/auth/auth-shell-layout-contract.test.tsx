import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_FORM_MAX_WIDTH_CLASS } from '@/features/auth/constants';
import {
  AUTH_BRANDING_RELATIVE_PATH,
  AUTH_DESKTOP_ONLY_CLASS,
  AUTH_EDITORIAL_CARD_TEST_ID,
  AUTH_FORM_CONTAINER_RELATIVE_PATH,
  AUTH_LAYOUT_CSS_RELATIVE_PATH,
  AUTH_LAYOUT_VIEWPORTS,
  AUTH_SHELL_KIND,
  AUTH_SHELL_LAYOUT_CONTRACT,
  AUTH_SPLIT_MIN_WIDTH_PX,
  authDesktopOnlyCssIssues,
  editorialCardExpectedVisible,
  editorialCardVisibleFromCss,
  inspectAuthDesktopOnlyCss,
  inspectAuthLayoutSourceIssues,
  inspectAuthShellHelperSourceIssues,
} from '@/lib/auth/auth-shell-layout-contract';
import {
  ALWAYS_VISIBLE_AUTH_DESKTOP_ONLY_CSS,
  SHELL_OWNING_BRANDING_SOURCE,
  SHELL_OWNING_FORM_CONTAINER_SOURCE,
  SWAPPED_BREAKPOINT_AUTH_DESKTOP_ONLY_CSS,
  SWAPPED_GRID_BREAKPOINT_LAYOUT_SOURCE,
  UNWRAPPED_EDITORIAL_LAYOUT_SOURCE,
} from './auth-shell-layout-red-fixtures';

const webRoot = process.cwd();

function readWebSource(relativePath: string): string {
  return readFileSync(join(webRoot, relativePath), 'utf8');
}

const productionCss = readWebSource(AUTH_LAYOUT_CSS_RELATIVE_PATH);
const productionCssInspection = inspectAuthDesktopOnlyCss(productionCss);

vi.mock('@clerk/nextjs', () => ({
  SignOutButton: ({ children }: { readonly children: ReactNode }) => children,
}));

vi.mock('@jovie/ui', () => ({
  Button: ({ children }: { readonly children: ReactNode }) => (
    <button type='button'>{children}</button>
  ),
  DropdownMenu: ({ children }: { readonly children: ReactNode }) => children,
  DropdownMenuContent: ({ children }: { readonly children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({ children }: { readonly children: ReactNode }) => (
    <button type='button'>{children}</button>
  ),
  DropdownMenuTrigger: ({
    children,
  }: {
    readonly children: ReactNode;
    readonly asChild?: boolean;
  }) => children,
}));

vi.mock('@/components/atoms/AppIconButton', () => ({
  AppIconButton: ({
    children,
    ariaLabel,
  }: {
    readonly children: ReactNode;
    readonly ariaLabel: string;
  }) => (
    <button type='button' aria-label={ariaLabel}>
      {children}
    </button>
  ),
}));

vi.mock('@/components/atoms/BrandLogo', () => ({
  BrandLogo: () => <svg aria-hidden='true' data-testid='brand-logo' />,
}));

vi.mock('@/hooks/useMobileKeyboard', () => ({
  useMobileKeyboard: () => ({ isKeyboardVisible: false }),
}));

vi.mock('@/components/marketing/ProductScreenshotFrame', () => ({
  ProductScreenshotFrame: () => <div data-testid='product-screenshot-frame' />,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: vi.fn() }),
}));

vi.mock('@/lib/desktop/electron-bridge', () => ({
  isElectronRuntime: () => false,
  openDesktopAuthUrl: vi.fn(),
}));

import { AuthModalShell } from '@/components/auth/AuthModalShell';
import { AuthFormContainer } from '@/components/features/auth/AuthFormContainer';
import { AuthLayout } from '@/components/features/auth/AuthLayout';
import { DesktopAuthRouteHandoff } from '../../../app/(auth)/DesktopAuthRouteHandoff';

const originalShowModal = HTMLDialogElement.prototype.showModal;
const originalClose = HTMLDialogElement.prototype.close;

describe('auth shell layout contract', () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = vi.fn();
    HTMLDialogElement.prototype.close = vi.fn();
  });

  afterEach(() => {
    HTMLDialogElement.prototype.showModal = originalShowModal;
    HTMLDialogElement.prototype.close = originalClose;
    document.body.style.removeProperty('overflow');
    document.body.style.removeProperty('overscroll-behavior');
    document.documentElement.style.removeProperty('overflow');
    document.documentElement.style.removeProperty('overscroll-behavior');
  });

  it('pins production CSS to the 1024px split breakpoint', () => {
    expect(authDesktopOnlyCssIssues(productionCssInspection)).toEqual([]);
    expect(productionCssInspection.defaultDisplay).toBe('none');
    expect(productionCssInspection.mediaMinWidthPx).toBe(
      AUTH_SPLIT_MIN_WIDTH_PX
    );
    expect(productionCss).toContain(`min-width: ${AUTH_SPLIT_MIN_WIDTH_PX}px`);
  });

  it('keeps AuthLayout split on the desktop-only editorial wrapper', () => {
    const layoutSource = readWebSource(
      'components/features/auth/AuthLayout.tsx'
    );
    expect(inspectAuthLayoutSourceIssues(layoutSource)).toEqual([]);
    expect(layoutSource).toContain(AUTH_DESKTOP_ONLY_CLASS);
    expect(layoutSource).toContain("data-auth-editorial-card='desktop-only'");
  });

  it('keeps helper components from owning auth shell geometry or breakpoints', () => {
    const { container, unmount } = render(
      <AuthFormContainer>Auth form body</AuthFormContainer>
    );

    expect(container.firstChild).toHaveClass('w-full');
    expect(
      inspectAuthShellHelperSourceIssues(
        'form-container',
        readWebSource(AUTH_FORM_CONTAINER_RELATIVE_PATH)
      )
    ).toEqual([]);
    expect(
      inspectAuthShellHelperSourceIssues(
        'branding',
        readWebSource(AUTH_BRANDING_RELATIVE_PATH)
      )
    ).toEqual([]);

    unmount();
  });

  it('binds each sign-in surface to its documented shell', () => {
    const signinPage = readWebSource('app/(auth)/signin/SignInPageClient.tsx');
    const signinLoading = readWebSource('app/(auth)/signin/loading.tsx');
    const signinModal = readWebSource(
      'app/@auth/(.)signin/SigninModalClient.tsx'
    );
    const handoff = readWebSource('app/(auth)/DesktopAuthRouteHandoff.tsx');

    expect(signinPage).toContain("layoutVariant='split'");
    expect(signinPage).not.toContain("chrome='splash-b'");
    expect(signinPage).toContain('<DesktopAuthRouteHandoff');
    expect(signinLoading).toContain("layoutVariant='split'");
    expect(signinLoading).not.toContain("chrome='splash-b'");

    expect(signinModal).toContain('<AuthModalShell');
    expect(signinModal).not.toContain('<AuthLayout');
    expect(signinModal).not.toContain('AuthBrandPanel');

    expect(handoff).toContain('desktop-auth-route-handoff');
    expect(handoff).not.toContain('<AuthLayout');
    expect(handoff).not.toContain('AuthBrandPanel');
    expect(handoff).not.toContain('data-auth-modal-shell');
  });

  it.each(
    AUTH_LAYOUT_VIEWPORTS
  )('$name ($width) editorial visibility matches the contract', ({ width }) => {
    expect(editorialCardExpectedVisible('signin-full-route', width)).toBe(
      width >= AUTH_SPLIT_MIN_WIDTH_PX
    );
    expect(editorialCardVisibleFromCss(productionCssInspection, width)).toBe(
      editorialCardExpectedVisible('signin-full-route', width)
    );

    expect(
      editorialCardExpectedVisible('signin-intercepted-modal', width)
    ).toBe(false);
    expect(editorialCardExpectedVisible('desktop-return-handoff', width)).toBe(
      false
    );
  });

  it.each(
    AUTH_LAYOUT_VIEWPORTS
  )('$name ($width) desktop split route mounts the editorial card behind desktop-only CSS', ({
    width,
  }) => {
    const { container, unmount } = render(
      <AuthLayout formTitle='Sign In' layoutVariant='split'>
        <div>Auth form body</div>
      </AuthLayout>
    );

    const shell = container.querySelector('[data-auth-shell]');
    const editorial = screen.getByTestId(AUTH_EDITORIAL_CARD_TEST_ID);
    const wrapper = container.querySelector(
      `[data-auth-editorial-card='desktop-only']`
    );

    expect(shell).toHaveAttribute(
      'data-auth-shell-kind',
      AUTH_SHELL_KIND.desktopSplitRoute
    );
    expect(shell).toHaveAttribute('data-auth-layout-variant', 'split');
    expect(wrapper).toHaveClass(AUTH_DESKTOP_ONLY_CLASS);
    expect(editorial).toBeInTheDocument();
    expect(editorialCardVisibleFromCss(productionCssInspection, width)).toBe(
      width >= AUTH_SPLIT_MIN_WIDTH_PX
    );

    unmount();
  });

  it.each(
    AUTH_LAYOUT_VIEWPORTS
  )('$name ($width) intercepted modal never mounts the editorial card or a fallback split shell', ({
    width,
  }) => {
    const { container, unmount } = render(
      <AuthModalShell ariaLabel='Sign in to Jovie'>
        <div>Modal auth form</div>
      </AuthModalShell>
    );

    expect(container.querySelector('[data-auth-modal-shell]')).toHaveAttribute(
      'data-auth-shell-kind',
      AUTH_SHELL_KIND.interceptedModal
    );
    expect(
      container.querySelector('[data-auth-layout-variant]')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId(AUTH_EDITORIAL_CARD_TEST_ID)
    ).not.toBeInTheDocument();
    expect(
      container.querySelector('[data-auth-editorial-card]')
    ).not.toBeInTheDocument();
    expect(
      editorialCardExpectedVisible('signin-intercepted-modal', width)
    ).toBe(false);

    unmount();
  });

  it.each(
    AUTH_LAYOUT_VIEWPORTS
  )('$name ($width) desktop-return handoff never mounts the editorial card or a fallback auth shell', ({
    width,
  }) => {
    const { container, unmount } = render(<DesktopAuthRouteHandoff />);

    const handoff = screen.getByTestId('desktop-auth-route-handoff');
    expect(handoff).toHaveAttribute(
      'data-auth-shell-kind',
      AUTH_SHELL_KIND.desktopReturnHandoff
    );
    expect(
      container.querySelector('[data-auth-shell]')
    ).not.toBeInTheDocument();
    expect(
      container.querySelector('[data-auth-modal-shell]')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId(AUTH_EDITORIAL_CARD_TEST_ID)
    ).not.toBeInTheDocument();
    expect(editorialCardExpectedVisible('desktop-return-handoff', width)).toBe(
      false
    );

    unmount();
  });

  it('does not mount the editorial card on splash-B stack chrome', () => {
    const { container } = render(
      <AuthLayout formTitle='Sign In' chrome='splash-b'>
        <div>Auth form body</div>
      </AuthLayout>
    );

    expect(container.querySelector('[data-auth-shell]')).toHaveAttribute(
      'data-auth-shell-kind',
      AUTH_SHELL_KIND.stackRoute
    );
    expect(
      screen.queryByTestId(AUTH_EDITORIAL_CARD_TEST_ID)
    ).not.toBeInTheDocument();
  });

  it('rejects a swapped 768px editorial breakpoint', () => {
    const inspected = inspectAuthDesktopOnlyCss(
      SWAPPED_BREAKPOINT_AUTH_DESKTOP_ONLY_CSS
    );

    expect(authDesktopOnlyCssIssues(inspected)).toEqual(['swapped-breakpoint']);
    expect(editorialCardVisibleFromCss(inspected, 768)).toBe(true);
    expect(editorialCardExpectedVisible('signin-full-route', 768)).toBe(false);
    expect(editorialCardVisibleFromCss(inspected, 768)).not.toBe(
      editorialCardExpectedVisible('signin-full-route', 768)
    );
  });

  it('rejects an always-visible editorial card', () => {
    const inspected = inspectAuthDesktopOnlyCss(
      ALWAYS_VISIBLE_AUTH_DESKTOP_ONLY_CSS
    );

    expect(authDesktopOnlyCssIssues(inspected)).toEqual([
      'default-visible',
      'missing-desktop-media',
    ]);
    expect(editorialCardVisibleFromCss(inspected, 390)).toBe(true);
    expect(editorialCardExpectedVisible('signin-full-route', 390)).toBe(false);
  });

  it('rejects a swapped or unwrapped split-grid source', () => {
    expect(
      inspectAuthLayoutSourceIssues(SWAPPED_GRID_BREAKPOINT_LAYOUT_SOURCE)
    ).toEqual(['missing-lg-split-grid', 'swapped-grid-breakpoint']);
    expect(
      inspectAuthLayoutSourceIssues(UNWRAPPED_EDITORIAL_LAYOUT_SOURCE)
    ).toEqual(['missing-desktop-only-class', 'editorial-unwrapped']);
  });

  it('rejects helpers that re-own shell padding, form width, or branding breakpoints', () => {
    expect(
      inspectAuthShellHelperSourceIssues(
        'form-container',
        SHELL_OWNING_FORM_CONTAINER_SOURCE
      )
    ).toEqual([
      'form-container-owns-shell-padding',
      'form-container-owns-form-width',
    ]);
    expect(
      inspectAuthShellHelperSourceIssues(
        'branding',
        SHELL_OWNING_BRANDING_SOURCE
      )
    ).toEqual([
      'branding-owns-breakpoint',
      'branding-owns-gradient-shell',
      'branding-owns-decorative-orbs',
      'branding-bypasses-auth-brand-panel',
    ]);
  });

  it('keeps AuthLayout as the only production auth form width owner', () => {
    const layoutSource = readWebSource('components/features/auth/AuthLayout.tsx');
    const formContainerSource = readWebSource(AUTH_FORM_CONTAINER_RELATIVE_PATH);

    expect(layoutSource).toContain('AUTH_FORM_MAX_WIDTH_CLASS');
    expect(layoutSource).toContain(AUTH_FORM_MAX_WIDTH_CLASS);
    expect(formContainerSource).not.toContain('AUTH_FORM_MAX_WIDTH_CLASS');
  });

  it('keeps production auth shells off the deliberate-red fixtures', () => {
    const productionSources = [
      'components/features/auth/AuthLayout.tsx',
      AUTH_FORM_CONTAINER_RELATIVE_PATH,
      AUTH_BRANDING_RELATIVE_PATH,
      'components/auth/AuthModalShell.tsx',
      'app/(auth)/DesktopAuthRouteHandoff.tsx',
      'app/(auth)/signin/SignInPageClient.tsx',
      'app/@auth/(.)signin/SigninModalClient.tsx',
      AUTH_LAYOUT_CSS_RELATIVE_PATH,
    ];

    for (const sourcePath of productionSources) {
      const source = readWebSource(sourcePath);
      expect(source, sourcePath).not.toContain(
        'auth-shell-layout-red-fixtures'
      );
      expect(source, sourcePath).not.toContain('data-deliberate-red');
    }

    expect(AUTH_SHELL_LAYOUT_CONTRACT['signin-full-route'].editorialCard).toBe(
      'desktop-only'
    );
    expect(
      AUTH_SHELL_LAYOUT_CONTRACT['signin-intercepted-modal'].editorialCard
    ).toBe('never');
    expect(
      AUTH_SHELL_LAYOUT_CONTRACT['desktop-return-handoff'].editorialCard
    ).toBe('never');
  });
});
