import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AudienceEngagementCell } from '@/components/organisms/table';

function renderWithTooltip(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe('AudienceEngagementCell', () => {
  it('renders visit count for high intent', () => {
    renderWithTooltip(
      <AudienceEngagementCell visits={12} intentLevel='high' />
    );
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('renders visit count for medium intent', () => {
    renderWithTooltip(
      <AudienceEngagementCell visits={5} intentLevel='medium' />
    );
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('renders visit count for low intent', () => {
    renderWithTooltip(<AudienceEngagementCell visits={1} intentLevel='low' />);
    expect(screen.getByText('1')).toBeInTheDocument();
  });
});
