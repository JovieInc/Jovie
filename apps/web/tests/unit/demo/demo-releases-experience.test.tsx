import { TooltipProvider } from '@jovie/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { describe, expect, it, vi } from 'vitest';

const runDemoAction = vi.fn(() => Promise.resolve());

vi.mock('@/components/demo/demo-actions', () => ({
  runDemoAction,
}));

// Mock next/image for test environment
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { priority: _priority, fetchPriority: _fp, ...rest } = props;
    return <img alt='' {...rest} />;
  },
}));

const { DemoReleasesExperience } = await import(
  '@/components/demo/DemoReleasesExperience'
);

function renderDemo() {
  return render(
    <NuqsTestingAdapter>
      <TooltipProvider>
        <DemoReleasesExperience />
      </TooltipProvider>
    </NuqsTestingAdapter>
  );
}

describe('DemoReleasesExperience', () => {
  it('renders fixture data and opens the selected release in the drawer', () => {
    renderDemo();

    // The sidebar nav has a Releases tab and it appears in the breadcrumb
    expect(screen.getAllByText('Releases').length).toBeGreaterThan(0);

    // Release titles should appear in the list
    expect(screen.getAllByText('Night Drive').length).toBeGreaterThan(0);

    // Click a release row to open the detail drawer
    fireEvent.click(screen.getByText('Static Skies'));

    // Detail drawer should show the release info
    expect(screen.getAllByText('Static Skies').length).toBeGreaterThan(0);
  });

  it('renders the Add release button in the header', () => {
    renderDemo();

    expect(
      screen.getByRole('button', { name: 'Add release' })
    ).toBeInTheDocument();
  });
});
