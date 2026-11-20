import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '../test-utils/a11y';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from './context-menu';

// Helper: right-click on an element
function rightClick(element: HTMLElement) {
  fireEvent.contextMenu(element);
}

// Helper component for basic testing
const TestContextMenu = ({ onItemClick }: { onItemClick?: () => void }) => (
  <ContextMenu>
    <ContextMenuTrigger>
      <div data-testid='trigger-area' style={{ width: 200, height: 200 }}>
        Right click me
      </div>
    </ContextMenuTrigger>
    <ContextMenuContent>
      <ContextMenuLabel>Actions</ContextMenuLabel>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={onItemClick}>Edit</ContextMenuItem>
      <ContextMenuItem>Copy</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem variant='destructive'>Delete</ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
);

describe('ContextMenu accessibility', () => {
  // The menu portals to document.body outside any page landmark, so axe runs
  // on the trigger's container and on the opened menu element itself.
  it('has no axe violations when opened by right-click', async () => {
    const { container } = render(<TestContextMenu />);
    rightClick(screen.getByTestId('trigger-area'));
    const menu = await screen.findByRole('menu');
    await expectNoA11yViolations(container);
    await expectNoA11yViolations(menu);
  });

  it('has no axe violations for an empty menu with long right-to-left copy', async () => {
    const { container } = render(
      <ContextMenu dir='rtl'>
        <ContextMenuTrigger>
          <div data-testid='rtl-trigger'>
            انقر بزر الفأرة الأيمن على بطاقة الإصدار
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuLabel>إضافة إلى قائمة التشغيل</ContextMenuLabel>
          <ContextMenuItem disabled>لا توجد قوائم تشغيل بعد</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
    rightClick(screen.getByTestId('rtl-trigger'));
    const menu = await screen.findByRole('menu');
    expect(menu).toHaveAttribute('dir', 'rtl');
    await expectNoA11yViolations(container);
    await expectNoA11yViolations(menu);
  });
});
