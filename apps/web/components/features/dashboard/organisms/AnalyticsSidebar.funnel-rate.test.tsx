import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FunnelStage } from './AnalyticsSidebar';

describe('FunnelStage rate column', () => {
  const stageProps = {
    label: 'Profile Views',
    value: 12847,
    barPercent: 50,
    barIndex: 0,
    loading: false,
  };

  it('reserves one right-aligned tabular rate column on every stage', () => {
    const { container: withoutRate } = render(
      <FunnelStage {...stageProps} rate={null} />
    );
    const { container: withRate } = render(
      <FunnelStage {...stageProps} rate='75%' />
    );

    // The first stage has no rate. It still holds the column, so all stage
    // values end on the same right edge.
    const emptyColumn = withoutRate.querySelector('[data-funnel-rate]');
    const filledColumn = withRate.querySelector('[data-funnel-rate]');
    expect(emptyColumn).toBeEmptyDOMElement();
    expect(filledColumn).toHaveTextContent('75%');
    for (const column of [emptyColumn, filledColumn]) {
      expect(column).toHaveClass('w-8', 'text-right', 'tabular-nums');
    }
    expect(emptyColumn?.previousElementSibling).toHaveClass('tabular-nums');
  });
});
