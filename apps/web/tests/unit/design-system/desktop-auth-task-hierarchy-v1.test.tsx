import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DesktopAuthHandoffActions } from '@/app/desktop-auth/DesktopAuthClient';
import {
  DesktopAuthFocusedHierarchyGreenFixture,
  DesktopAuthLargeActionStackRedFixture,
} from './desktop-auth-task-hierarchy-fixtures';

vi.mock('@/lib/desktop/electron-bridge', () => ({
  closeDesktopAuthWindow: vi.fn().mockResolvedValue(undefined),
  completeDesktopPasskeySignIn: vi.fn().mockResolvedValue({ ok: true }),
  copyDesktopAuthUrl: vi.fn().mockResolvedValue({ ok: true }),
  openDesktopAuthUrl: vi.fn().mockResolvedValue({ ok: true }),
  redeemDesktopAuthReturnCode: vi.fn().mockResolvedValue({ ok: true }),
  supportsDesktopAuthReturnCode: vi.fn(() => true),
  useDesktopAppBootSignal: vi.fn(),
}));

type HierarchyViolation =
  | 'missing-visible-heading'
  | 'missing-instructions'
  | 'wrong-default-control-count'
  | 'wrong-primary-count'
  | 'fallbacks-exposed-before-disclosure'
  | 'cancel-is-peer-cta';

function evaluateDefaultHierarchy(root: HTMLElement): HierarchyViolation[] {
  const violations: HierarchyViolation[] = [];
  const heading = root.querySelector('h1');
  if (!heading || heading.classList.contains('sr-only')) {
    violations.push('missing-visible-heading');
  }
  if (!root.querySelector('p')?.textContent?.trim()) {
    violations.push('missing-instructions');
  }

  const taskControls =
    root.querySelectorAll<HTMLButtonElement>('[data-auth-action]');
  if (taskControls.length !== 3) {
    violations.push('wrong-default-control-count');
  }
  const primaryControls = [...taskControls].filter(
    control => control.dataset.variant === 'primary'
  );
  if (primaryControls.length !== 1) {
    violations.push('wrong-primary-count');
  }
  if (
    root.querySelector('[data-auth-option-row]') ||
    root.querySelector('[data-auth-action="copy"]') ||
    root.querySelector('[data-auth-action="code"]') ||
    root.querySelector('[data-auth-action="qr"]')
  ) {
    violations.push('fallbacks-exposed-before-disclosure');
  }
  const cancel = root.querySelector<HTMLButtonElement>(
    '[data-auth-action="cancel"]'
  );
  if (
    !cancel ||
    cancel.dataset.variant !== 'link' ||
    cancel.classList.contains('w-full') ||
    cancel.className.includes('border-btn')
  ) {
    violations.push('cancel-is-peer-cta');
  }
  return violations;
}

describe('JOV-6709 focused task-action hierarchy', () => {
  it('rejects the deliberate-red five-action stack', () => {
    render(<DesktopAuthLargeActionStackRedFixture />);
    const fixture = screen.getByTestId('desktop-auth-hierarchy-red');

    expect(fixture).toHaveAttribute(
      'data-deliberate-red',
      'desktop-auth-large-action-stack'
    );
    expect(evaluateDefaultHierarchy(fixture)).toEqual([
      'missing-visible-heading',
      'missing-instructions',
      'wrong-default-control-count',
      'fallbacks-exposed-before-disclosure',
      'cancel-is-peer-cta',
    ]);
  });

  it('accepts the neighboring-green focused hierarchy', () => {
    render(<DesktopAuthFocusedHierarchyGreenFixture />);
    const fixture = screen.getByTestId('desktop-auth-hierarchy-green');

    expect(fixture).toHaveAttribute(
      'data-neighboring-green',
      'desktop-auth-focused-hierarchy'
    );
    expect(evaluateDefaultHierarchy(fixture)).toEqual([]);
  });

  it('certifies the production default and equal disclosed option rows', async () => {
    render(
      <DesktopAuthHandoffActions
        authUrl='https://jov.ie/auth/start?client=electron'
        showCancelSignIn
      />
    );
    const production = screen.getByTestId('desktop-auth-hierarchy');

    expect(evaluateDefaultHierarchy(production)).toEqual([]);
    fireEvent.click(
      screen.getByRole('button', { name: 'Other Sign-in Options' })
    );
    const optionRows = await screen.findAllByRole('button', {
      name: /Copy Sign-in Link|Enter A Code|Scan With Phone/,
    });
    expect(optionRows).toHaveLength(3);
    for (const row of optionRows) {
      expect(row).toHaveAttribute('data-auth-option-row', '');
      expect(row).toHaveAttribute('data-variant', 'tertiary');
    }
    expect(new Set(optionRows.map(row => row.className)).size).toBe(1);
  });

  it('keeps returning-user Touch ID focused and progressively discloses browser fallbacks', async () => {
    render(
      <DesktopAuthHandoffActions
        authUrl='https://jov.ie/auth/start?client=electron'
        showCancelSignIn
        showTouchId
      />
    );
    const production = screen.getByTestId('desktop-auth-hierarchy');

    expect(evaluateDefaultHierarchy(production)).toEqual([]);
    expect(
      screen.getByRole('button', { name: 'Sign In With Touch ID' })
    ).toHaveAttribute('data-variant', 'primary');
    expect(
      screen.queryByRole('button', { name: 'Continue In Browser' })
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Other Sign-in Options' })
    );
    const optionRows = await screen.findAllByRole('button', {
      name: /Continue In Browser|Copy Sign-in Link|Enter A Code|Scan With Phone/,
    });
    expect(optionRows).toHaveLength(4);
    expect(new Set(optionRows.map(row => row.className)).size).toBe(1);

    fireEvent.click(
      screen.getByRole('button', { name: 'Continue In Browser' })
    );
    expect(
      screen.getByRole('button', { name: 'Continue In Browser' })
    ).toHaveAttribute('data-variant', 'primary');
    expect(
      screen.queryByRole('button', { name: 'Sign In With Touch ID' })
    ).not.toBeInTheDocument();
  });
});
