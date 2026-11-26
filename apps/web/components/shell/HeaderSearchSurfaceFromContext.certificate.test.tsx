import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  HeaderActionsProvider,
  useHeaderActions,
} from '@/contexts/HeaderActionsContext';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { HeaderSearchSurfaceFromContext } from './HeaderSearchSurfaceFromContext';

function Probe() {
  const { isCommandPaletteOpen } = useHeaderActions();
  return <output>{isCommandPaletteOpen ? 'Open' : 'Closed'}</output>;
}

function renderSurface(
  props: Parameters<typeof HeaderSearchSurfaceFromContext>[0],
  dir?: 'rtl'
) {
  return render(
    <HeaderActionsProvider>
      <TooltipProvider>
        <div dir={dir}>
          <HeaderSearchSurfaceFromContext {...props} />
          <Probe />
        </div>
      </TooltipProvider>
    </HeaderActionsProvider>
  );
}

describe('HeaderSearchSurfaceFromContext certificate', () => {
  it('toggles the command palette by click and keyboard, axe-clean', async () => {
    const user = userEvent.setup();
    const { container } = renderSurface({});

    const trigger = screen.getByRole('button', { name: 'Search Jovie' });
    await user.click(trigger);
    expect(screen.getByText('Open')).toBeInTheDocument();
    trigger.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByText('Closed')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps the calm, compact and right-to-left triggers axe-clean', async () => {
    const calm = renderSurface({ calm: true }, 'rtl');
    expect(
      screen.getByRole('button', { name: 'Search chats in Jovie' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(calm.container);
    calm.unmount();

    const compact = renderSurface({ compact: true, className: 'custom' });
    expect(screen.getByRole('button', { name: 'Search Jovie' })).toHaveClass(
      'custom'
    );
    expect(screen.queryByText('Search')).not.toBeInTheDocument();
    await expectNoA11yViolations(compact.container);
  });
});
