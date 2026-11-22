import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AudienceEngagementCell } from './AudienceEngagementCell';

function renderCell(
  props: Parameters<typeof AudienceEngagementCell>[0],
  dir?: 'rtl'
) {
  return render(
    <TooltipProvider>
      <div dir={dir}>
        <AudienceEngagementCell {...props} />
      </div>
    </TooltipProvider>
  );
}

describe('AudienceEngagementCell', () => {
  it.each([
    [12, 'high', '12 visits · High Intent'],
    [1, 'medium', '1 visit · Medium Intent'],
    [0, 'low', '0 visits · Low Intent'],
  ] as const)(
    'shows %i visits at %s intent in its tooltip',
    async (visits, intentLevel, text) => {
      const user = userEvent.setup();
      const { container } = renderCell({ visits, intentLevel });

      expect(screen.getByText(String(visits))).toBeInTheDocument();
      await user.hover(screen.getByText(String(visits)));
      expect((await screen.findAllByText(text)).length).toBeGreaterThan(0);
      await expectNoA11yViolations(container);
    }
  );

  it('keeps a long count and custom class axe-clean in a right-to-left row', async () => {
    const { container } = renderCell(
      { visits: 1234567, intentLevel: 'medium', className: 'custom-cell' },
      'rtl'
    );

    expect(screen.getByText('1234567')).toBeInTheDocument();
    expect(container.querySelector('.custom-cell')).not.toBeNull();
    await expectNoA11yViolations(container);
  });
});
