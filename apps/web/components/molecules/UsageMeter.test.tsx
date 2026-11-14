import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createUsageMeterModel, type UsageMeterModel } from '@/lib/usage/model';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { UsageMeter } from './UsageMeter';

// Behaviour of the healthy/warning/exhausted fills lives in
// tests/unit/components/UsageMeter.test.tsx; this colocated file covers the
// zero-allowance, last-known, description and density states plus axe.
function model(input: { used: number; limit: number }): UsageMeterModel {
  const result = createUsageMeterModel(input);
  if (!result) throw new Error('fixture must produce a model');
  return result;
}

describe('UsageMeter', () => {
  it('announces remaining capacity through an accessible progress bar', async () => {
    const { container } = render(
      <UsageMeter
        label='Weekly messages'
        description='Chat replies and drafts'
        model={model({ used: 20, limit: 70 })}
        resetLabel='Resets Aug 24, 11:00 AM'
      />
    );

    expect(screen.getByText('Chat replies and drafts')).toBeInTheDocument();
    expect(screen.getByText('50 left')).toBeInTheDocument();
    expect(screen.getByText('20 of 70 used')).toBeInTheDocument();
    expect(screen.getByText('Resets Aug 24, 11:00 AM')).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: 'Weekly messages remaining' })
    ).toHaveAttribute('aria-valuetext', '50 of 70 remaining. Available.');
    expect(screen.getByTestId('usage-meter-state-label')).toHaveTextContent(
      'Available'
    );
    await expectNoA11yViolations(container);
  });

  it('formats large counts with grouping separators', () => {
    render(
      <UsageMeter
        label='Weekly messages'
        model={model({ used: 1250, limit: 10000 })}
        resetLabel='Resets soon'
      />
    );

    expect(screen.getByText('8,750 left')).toBeInTheDocument();
    expect(screen.getByText('1,250 of 10,000 used')).toBeInTheDocument();
  });

  it('says there is no allowance and drops the progress bar when the limit is zero', async () => {
    const { container } = render(
      <UsageMeter
        label='Weekly messages'
        model={model({ used: 0, limit: 0 })}
        resetLabel='Resets soon'
      />
    );

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByTestId('usage-meter-state-label')).toHaveTextContent(
      'No allowance'
    );
    expect(screen.getByText('0 of 0 used')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('labels a last-known snapshot without a live status', async () => {
    const { container } = render(
      <UsageMeter
        label='Last Known Weekly Messages'
        model={model({ used: 58, limit: 70 })}
        resetLabel='Reset timing unavailable'
        showStatus={false}
      />
    );

    expect(
      screen.queryByTestId('usage-meter-state-label')
    ).not.toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuetext',
      '12 of 70 remaining. Last known usage.'
    );
    await expectNoA11yViolations(container);
  });

  it('exposes the state for styling and sizes the fill to what remains', () => {
    const { container } = render(
      <UsageMeter
        label='Weekly messages'
        model={model({ used: 58, limit: 70 })}
        resetLabel='Resets soon'
        density='compact'
        className='custom-meter'
      />
    );

    const root = container.firstElementChild;
    expect(root).toHaveAttribute('data-state', 'warning');
    expect(root).toHaveClass('custom-meter', 'px-2.5');
    expect(screen.getByTestId('usage-meter-fill')).toHaveClass('bg-warning');
    expect(screen.getByTestId('usage-meter-fill')).toHaveStyle({
      width: '17%',
    });
  });

  it('stays accessible right to left', async () => {
    const { container } = render(
      <div dir='rtl'>
        <UsageMeter
          label='الرسائل الأسبوعية'
          model={model({ used: 20, limit: 70 })}
          resetLabel='يُعاد التعيين قريبًا'
        />
      </div>
    );

    expect(
      screen.getByRole('progressbar', { name: 'الرسائل الأسبوعية remaining' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
