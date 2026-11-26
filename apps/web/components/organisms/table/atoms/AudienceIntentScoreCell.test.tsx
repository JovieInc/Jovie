import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AudienceIntentScoreCell } from './AudienceIntentScoreCell';

function renderCell(
  props: Parameters<typeof AudienceIntentScoreCell>[0],
  dir?: 'rtl'
) {
  return render(
    <TooltipProvider>
      <div dir={dir}>
        <AudienceIntentScoreCell {...props} />
      </div>
    </TooltipProvider>
  );
}

describe('AudienceIntentScoreCell', () => {
  it.each([
    ['high', 'High intent', 'lucide-flame'],
    ['medium', 'Medium intent', 'lucide-trending-up'],
    ['low', 'Low intent', 'lucide-trending-down'],
  ] as const)(
    'shows the %s icon and its tooltip label',
    async (intentLevel, label, glyph) => {
      const user = userEvent.setup();
      const { container } = renderCell({ intentLevel });

      expect(container.querySelector('svg')).toHaveClass(glyph);
      await user.hover(container.querySelector('svg') as Element);
      expect((await screen.findAllByText(label)).length).toBeGreaterThan(0);
      await expectNoA11yViolations(container);
    }
  );

  it('keeps a custom class in a right-to-left row', async () => {
    const { container } = renderCell(
      { intentLevel: 'low', className: 'custom-cell' },
      'rtl'
    );

    expect(container.querySelector('.custom-cell')).not.toBeNull();
    await expectNoA11yViolations(container);
  });
});
