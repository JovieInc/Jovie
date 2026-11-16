import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DashboardActivityFeed } from './DashboardActivityFeed';

const { useActivityFeedQueryMock } = vi.hoisted(() => ({
  useActivityFeedQueryMock: vi.fn(),
}));

vi.mock('@/lib/queries', () => ({
  useActivityFeedQuery: useActivityFeedQueryMock,
}));

const activities = [
  {
    id: 'activity-1',
    type: 'visit',
    description: 'New fan viewed the profile from Instagram.',
    icon: 'visit',
    timestamp: '2026-08-31T18:20:00.000Z',
    href: '/app/dashboard/audience',
  },
  {
    id: 'activity-2',
    type: 'click',
    description: 'Clicked Listen Now for Midnight Drive.',
    icon: 'listen',
    timestamp: '2026-08-31T17:05:00.000Z',
  },
];

function mockQuery(state: {
  data?: unknown[];
  isLoading?: boolean;
  isFetching?: boolean;
  error?: Error | null;
}) {
  useActivityFeedQueryMock.mockReturnValue({
    data: state.data,
    isLoading: state.isLoading ?? false,
    isFetching: state.isFetching ?? false,
    error: state.error ?? null,
  });
}

describe('DashboardActivityFeed', () => {
  beforeEach(() => {
    useActivityFeedQueryMock.mockReset();
  });

  it('renders each activity and announces the count', async () => {
    mockQuery({ data: activities });
    const { container } = render(
      <DashboardActivityFeed profileId='profile-1' />
    );

    expect(
      screen.getByText('New fan viewed the profile from Instagram.')
    ).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('2 activities loaded')).toBeInTheDocument();
    expect(useActivityFeedQueryMock).toHaveBeenCalledWith({
      profileId: 'profile-1',
      range: '7d',
    });
    await expectNoA11yViolations(container);
  });

  it('marks the live indicator with the success token and respects reduced motion', () => {
    mockQuery({ data: activities });
    const { container } = render(
      <DashboardActivityFeed profileId='profile-1' />
    );
    const dot = container.querySelector('.bg-success');
    expect(dot).not.toBeNull();
    expect(dot).toHaveClass('motion-reduce:animate-none');
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('renders the loading state axe-clean', async () => {
    mockQuery({ data: undefined, isLoading: true, isFetching: true });
    const { container } = render(
      <DashboardActivityFeed profileId='profile-1' range='30d' />
    );
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(useActivityFeedQueryMock).toHaveBeenCalledWith({
      profileId: 'profile-1',
      range: '30d',
    });
    await expectNoA11yViolations(container);
  });

  it('renders the empty state axe-clean', async () => {
    mockQuery({ data: [] });
    const { container } = render(
      <DashboardActivityFeed profileId='profile-1' />
    );
    expect(
      screen.getByText(
        'No recent activity. Share your profile to see engagement here.'
      )
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders the error state axe-clean', async () => {
    mockQuery({ data: undefined, error: new Error('Server unavailable') });
    const { container } = render(
      <DashboardActivityFeed profileId='profile-1' />
    );
    expect(screen.getByText('Server unavailable')).toBeInTheDocument();
    expect(screen.getByText('Error: Server unavailable')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('falls back to a default error message', () => {
    mockQuery({ data: undefined, error: new Error('') });
    render(<DashboardActivityFeed profileId='profile-1' />);
    expect(screen.getByText('Failed to load activity')).toBeInTheDocument();
  });

  it('dims the list and announces a background refresh', async () => {
    mockQuery({ data: activities, isFetching: true });
    const { container } = render(
      <DashboardActivityFeed profileId='profile-1' />
    );
    expect(screen.getByText(/Refreshing activity feed/)).toBeInTheDocument();
    expect(screen.getByRole('list').parentElement).toHaveClass('opacity-70');
    await expectNoA11yViolations(container);
  });

  it('renders right-to-left content axe-clean', async () => {
    mockQuery({
      data: [{ ...activities[0], description: 'شاهد معجب جديد الملف الشخصي.' }],
    });
    const { container } = render(
      <div dir='rtl'>
        <DashboardActivityFeed profileId='profile-1' />
      </div>
    );
    expect(
      screen.getByText('شاهد معجب جديد الملف الشخصي.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
