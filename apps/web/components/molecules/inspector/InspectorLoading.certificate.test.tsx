import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { InspectorLoading } from './InspectorLoading';

function skeletonRows(container: HTMLElement) {
  return container.querySelectorAll('[data-testid="inspector-loading"] > div');
}

describe('InspectorLoading certificate', () => {
  it('announces a busy region with four rows by default, axe-clean', async () => {
    const { container } = render(<InspectorLoading />);
    const region = screen.getByTestId('inspector-loading');
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(skeletonRows(container)).toHaveLength(4);
    await expectNoA11yViolations(container);
  });

  it('renders no skeleton rows for zero rows but keeps the label', async () => {
    const { container } = render(<InspectorLoading rows={0} />);
    expect(skeletonRows(container)).toHaveLength(0);
    expect(screen.getByText('Loading inspector')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders a long list of rows on the 96px label grid', async () => {
    const { container } = render(<InspectorLoading rows={18} />);
    const rows = skeletonRows(container);
    expect(rows).toHaveLength(18);
    expect((rows[0] as HTMLElement).style.gridTemplateColumns).toBe(
      '96px minmax(0, 1fr)'
    );
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean in an RTL document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <InspectorLoading rows={2} />
      </div>
    );
    expect(skeletonRows(container)).toHaveLength(2);
    await expectNoA11yViolations(container);
  });
});
