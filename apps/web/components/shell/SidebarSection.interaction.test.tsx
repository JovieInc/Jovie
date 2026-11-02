import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { SidebarSection } from './SidebarSection';

function Section() {
  const [open, setOpen] = useState(false);
  return (
    <SidebarSection
      name='Releases'
      open={open}
      onToggle={() => setOpen(!open)}
      itemCount={1}
    >
      <span>My Release</span>
    </SidebarSection>
  );
}

describe('SidebarSection hover interactions', () => {
  it('shares the row hover token while retaining pointer and keyboard disclosure', async () => {
    const user = userEvent.setup();
    render(<Section />);
    const header = screen.getByRole('button', { name: 'Releases' });
    await user.hover(header);
    expect(header).toHaveClass('hover:bg-sidebar-accent');
    expect(header).toHaveAttribute('aria-expanded', 'false');
    await user.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'true');
    await user.unhover(header);
    expect(header).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(header).toHaveAttribute('aria-expanded', 'false');
  });
});
