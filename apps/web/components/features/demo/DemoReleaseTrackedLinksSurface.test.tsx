import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DemoReleaseTrackedLinksSurface } from './DemoReleaseTrackedLinksSurface';

vi.mock('./mock-release-data', () => ({
  DEMO_RELEASE_VIEW_MODELS: [
    { title: 'Test release', artistNames: ['Tim White', 'Cosmic Gate'] },
  ],
}));

vi.mock('./DemoAuthShell', () => ({
  DemoAuthShell: ({ children }: { readonly children?: ReactNode }) => (
    <div data-testid='demo-auth-shell'>{children}</div>
  ),
}));

vi.mock('@/components/organisms/AppShellContentPanel', () => ({
  AppShellContentPanel: ({ children }: { readonly children?: ReactNode }) => (
    <div data-testid='demo-app-shell-content-panel'>{children}</div>
  ),
}));

describe('DemoReleaseTrackedLinksSurface', () => {
  it('renders the demo release row credits through the canonical formatter', () => {
    render(<DemoReleaseTrackedLinksSurface />);

    expect(
      screen.getByTestId('demo-release-tracked-links-capture')
    ).toBeInTheDocument();

    // ds-cert:credit-format: the demo share surface renders the release row's
    // credit line via the canonical formatter ("Tim White and Cosmic Gate"),
    // never a local comma join.
    expect(screen.getByText('Tim White and Cosmic Gate')).toBeInTheDocument();
  });

  it('shows the UTM presets as flat pills and stays inert to pointer input', async () => {
    const user = userEvent.setup();
    const { container } = render(<DemoReleaseTrackedLinksSurface />);

    const copyPills = screen.getAllByText('Copy');
    expect(copyPills).toHaveLength(4);
    await user.click(copyPills[0]);
    expect(copyPills[0].className).not.toContain('border');
    expect(screen.getByText('Instagram Story')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
