import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HeaderActivityIndicator } from '@/features/dashboard/atoms/HeaderActivityIndicator';

const { useAppActivityStatusMock } = vi.hoisted(() => ({
  useAppActivityStatusMock: vi.fn(),
}));

vi.mock('@/features/dashboard/atoms/useAppActivityStatus', () => ({
  useAppActivityStatus: useAppActivityStatusMock,
}));

describe('HeaderActivityIndicator', () => {
  it('renders compact working status content with a count badge', () => {
    useAppActivityStatusMock.mockReturnValue({
      tone: 'working',
      label: 'Agents Running',
      detail: 'Two agents are still drafting.',
      count: 2,
    });

    render(<HeaderActivityIndicator />);

    expect(
      screen.getByLabelText('Two agents are still drafting.')
    ).toBeInTheDocument();
    expect(screen.getByText('Agents Running')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders nothing when there is no app-wide activity', () => {
    useAppActivityStatusMock.mockReturnValue(null);

    const { container } = render(<HeaderActivityIndicator />);

    expect(container).toBeEmptyDOMElement();
  });
});
