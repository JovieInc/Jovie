import { TooltipProvider } from '@jovie/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { describe, expect, it, vi } from 'vitest';

// Mock Clerk's useUser hook (pulled in transitively via DemoAuthShell → UnifiedSidebar → UserButton)
vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({ isLoaded: true, user: null }),
  useClerk: () => ({ signOut: vi.fn() }),
  useAuth: () => ({ isSignedIn: false, userId: null }),
  ClerkProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock nuqs sort params hook (avoids deep next/navigation dependency via nuqs → useRouter)
vi.mock('@/lib/nuqs/hooks', () => ({
  useReleaseSortParams: () => [
    { sort: 'releaseDate', direction: 'desc' },
    vi.fn(),
  ],
  useAudienceSortParams: () => [
    { sort: 'createdAt', direction: 'desc' },
    vi.fn(),
  ],
}));

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

  it('renders release data in the table', () => {
    renderDemo();

    // The table should contain mock release titles
    expect(screen.getAllByText('Night Drive').length).toBeGreaterThan(0);
  });
});
