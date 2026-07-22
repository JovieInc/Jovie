import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InsightsPanelView } from './InsightsPanel';

describe('InsightsPanelView', () => {
  it('wraps every category filter inside the compact viewport', () => {
    render(
      <TooltipProvider>
        <InsightsPanelView
          insights={[]}
          isLoading={false}
          error={null}
          selectedCategory='all'
          onCategoryChange={vi.fn()}
          onGenerate={vi.fn()}
          isGenerating={false}
        />
      </TooltipProvider>
    );

    const tablist = screen.getByRole('tablist', {
      name: 'Filter Insights By Category',
    });
    expect(tablist).toHaveClass('flex-wrap', 'gap-1.5');

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(9);
    for (const tab of tabs) {
      expect(tab).toHaveClass('shrink-0');
      expect(tab).not.toHaveClass('flex-1');
    }
  });
});
