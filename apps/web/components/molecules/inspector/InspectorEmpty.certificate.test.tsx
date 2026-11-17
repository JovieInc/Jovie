import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { InspectorEmpty } from './InspectorEmpty';

describe('InspectorEmpty certificate', () => {
  it('renders the default empty note axe-clean', async () => {
    const { container } = render(
      <InspectorEmpty message='No assets for this object.' />
    );
    expect(screen.getByText('No assets for this object.')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('honours a custom test id and wraps long copy', async () => {
    const message =
      'No assets for this object yet. Upload cover art, a canvas loop, lyric files or stems and they will appear here.';
    const { container } = render(
      <InspectorEmpty message={message} testId='assets-empty' />
    );
    expect(screen.getByTestId('assets-empty')).toHaveTextContent(message);
    expect(screen.queryByTestId('inspector-empty')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders Arabic copy in an RTL document axe-clean', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <InspectorEmpty message='لا توجد أصول لهذا العنصر.' />
      </div>
    );
    expect(screen.getByText('لا توجد أصول لهذا العنصر.')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
