import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '../test-utils/a11y';

import { SegmentControl } from './segment-control';

const defaultOptions = [
  { value: 'links', label: 'Links' },
  { value: 'music', label: 'Music' },
  { value: 'videos', label: 'Videos' },
] as const;

describe('SegmentControl accessibility', () => {
  it('has no axe violations across variants, partial availability, icon-only and RTL', async () => {
    const { container } = render(
      <div>
        <SegmentControl
          value='links'
          onValueChange={vi.fn()}
          options={defaultOptions}
          aria-label='Link category'
        />
        <SegmentControl
          value='overview'
          onValueChange={vi.fn()}
          aria-label='Release view'
          options={[
            { value: 'overview', label: 'Overview' },
            {
              value: 'audience',
              label: 'Audience',
              disabled: true,
              title: 'Audience data appears after the first 24 hours',
            },
          ]}
        />
        <SegmentControl
          value='grid'
          onValueChange={vi.fn()}
          variant='linear-pill'
          layout='hug'
          aria-label='Result layout'
          options={[
            {
              value: 'grid',
              label: <span aria-hidden='true'>▦</span>,
              ariaLabel: 'Grid view',
            },
            {
              value: 'list',
              label: <span aria-hidden='true'>☷</span>,
              ariaLabel: 'List view',
            },
          ]}
        />
        <div dir='rtl'>
          <SegmentControl
            value='music'
            onValueChange={vi.fn()}
            aria-label='اختر العرض'
            options={[
              { value: 'links', label: 'الروابط الاجتماعية' },
              { value: 'music', label: 'روابط الموسيقى والإصدارات' },
            ]}
          />
        </div>
      </div>
    );
    expect(screen.getAllByRole('tablist')).toHaveLength(4);
    await expectNoA11yViolations(container);
  });
});
