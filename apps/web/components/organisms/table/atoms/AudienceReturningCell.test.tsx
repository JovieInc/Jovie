import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AudienceReturningCell } from './AudienceReturningCell';

function renderCell(
  props: Parameters<typeof AudienceReturningCell>[0],
  dir?: 'rtl'
) {
  return render(
    <TooltipProvider>
      <div dir={dir}>
        <AudienceReturningCell {...props} />
      </div>
    </TooltipProvider>
  );
}

describe('AudienceReturningCell', () => {
  it.each([
    [3, 'Returning', 'lucide-arrow-left-right'],
    [1, 'First visit', 'lucide-star'],
    [0, 'New', 'lucide-sparkles'],
  ] as const)('shows %i visits as %s', async (visits, label, glyph) => {
    const user = userEvent.setup();
    const { container } = renderCell({ visits });

    expect(container.querySelector('svg')).toHaveClass(glyph);
    await user.hover(container.querySelector('svg') as Element);
    expect((await screen.findAllByText(label)).length).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
  });

  it('keeps a large count and custom class in a right-to-left row', async () => {
    const { container } = renderCell(
      { visits: 1234567, className: 'custom-cell' },
      'rtl'
    );

    expect(container.querySelector('.custom-cell')).not.toBeNull();
    expect(container.querySelector('svg')).toHaveClass(
      'lucide-arrow-left-right'
    );
    await expectNoA11yViolations(container);
  });
});
