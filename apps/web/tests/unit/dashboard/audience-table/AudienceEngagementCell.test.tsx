import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it } from 'vitest';
import { AudienceEngagementCell } from '@/components/organisms/table/atoms/AudienceEngagementCell';

function renderWithTooltip(
  props: ComponentProps<typeof AudienceEngagementCell>
) {
  return render(
    <TooltipProvider>
      <AudienceEngagementCell {...props} />
    </TooltipProvider>
  );
}

describe('AudienceEngagementCell', () => {
  it('renders visit count for high intent', () => {
    renderWithTooltip({ visits: 12, intentLevel: 'high' });
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(document.querySelector('.lucide-flame')).toBeInTheDocument();
  });

  it('renders visit count for medium intent', () => {
    renderWithTooltip({ visits: 5, intentLevel: 'medium' });
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('renders visit count for low intent', () => {
    renderWithTooltip({ visits: 1, intentLevel: 'low' });
    expect(screen.getByText('1')).toBeInTheDocument();
  });
});
