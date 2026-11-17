import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AudienceActionsCell } from './AudienceActionsCell';

describe('AudienceActionsCell', () => {
  it('names each visible action for assistive tech and caps them at three', async () => {
    const { container } = render(
      <AudienceActionsCell
        rowId='row-1'
        actions={[
          { label: 'Clicked Spotify link' },
          { label: 'Tipped $5' },
          { label: 'Followed on Instagram' },
          { label: 'Viewed profile' },
        ]}
      />
    );

    expect(screen.getByText('Clicked Spotify link')).toHaveClass('sr-only');
    expect(screen.getByText('Tipped $5')).toBeInTheDocument();
    expect(screen.getByText('Followed on Instagram')).toBeInTheDocument();
    expect(screen.queryByText('Viewed profile')).toBeNull();
    expect(screen.getByTitle('Tipped $5')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('honours maxActions and labels blank actions as unknown', async () => {
    const { container } = render(
      <AudienceActionsCell
        rowId='row-2'
        maxActions={2}
        actions={[{ label: '' }, { label: '' }, { label: 'Tipped $5' }]}
      />
    );

    expect(screen.getAllByText('Unknown action')).toHaveLength(2);
    expect(screen.queryByText('Tipped $5')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('renders an empty strip without errors when there are no actions', async () => {
    const { container } = render(
      <AudienceActionsCell rowId='row-3' actions={[]} className='custom' />
    );

    expect(container.firstElementChild).toHaveClass('custom');
    expect(container.firstElementChild).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });

  it('keeps an RTL label readable', async () => {
    const { container } = render(
      <div dir='rtl'>
        <AudienceActionsCell
          rowId='row-4'
          actions={[{ label: 'نقر على رابط Spotify' }]}
        />
      </div>
    );

    expect(screen.getByText('نقر على رابط Spotify')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
