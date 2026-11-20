import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
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
});
