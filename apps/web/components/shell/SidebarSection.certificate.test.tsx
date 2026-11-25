import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SidebarSection } from './SidebarSection';

describe('SidebarSection certificate', () => {
  it('toggles by click and keyboard and reports expansion, axe-clean', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const { container } = render(
      <SidebarSection name='Releases' open onToggle={onToggle} itemCount={2}>
        <span>One</span>
        <span>Two</span>
      </SidebarSection>
    );

    const header = screen.getByRole('button', { name: 'Releases' });
    expect(header).toHaveAttribute('aria-expanded', 'true');
    await user.click(header);
    header.focus();
    await user.keyboard('{Enter}');
    expect(onToggle).toHaveBeenCalledTimes(2);
    await expectNoA11yViolations(container);
  });

  it('renders an empty section as a plain label with no caret or disclosure, axe-clean', async () => {
    const { container, rerender } = render(
      <SidebarSection name='Releases' open onToggle={vi.fn()} itemCount={0}>
        {null}
      </SidebarSection>
    );
    expect(screen.queryByRole('button', { name: 'Releases' })).toBeNull();
    expect(screen.getByText('Releases')).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeNull();
    await expectNoA11yViolations(container);

    rerender(
      <SidebarSection
        name='Releases'
        open={false}
        onToggle={vi.fn()}
        itemCount={3}
      >
        <span>One</span>
      </SidebarSection>
    );
    expect(screen.getByRole('button', { name: 'Releases' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    await expectNoA11yViolations(container);
  });

  it('renders only the rows in the collapsed rail and nothing when closed', async () => {
    const { container, rerender } = render(
      <SidebarSection
        name='Releases'
        open
        collapsed
        onToggle={vi.fn()}
        itemCount={1}
      >
        <span>Row</span>
      </SidebarSection>
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Row')).toBeInTheDocument();
    await expectNoA11yViolations(container);

    rerender(
      <SidebarSection
        name='Releases'
        open={false}
        collapsed
        onToggle={vi.fn()}
        itemCount={1}
      >
        <span>Row</span>
      </SidebarSection>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a right-to-left header', async () => {
    const { container } = render(
      <div dir='rtl'>
        <SidebarSection
          name='مساحة العمل'
          open
          onToggle={vi.fn()}
          itemCount={1}
          className='custom'
        >
          <span>الإصدارات</span>
        </SidebarSection>
      </div>
    );

    expect(
      screen.getByRole('button', { name: 'مساحة العمل' })
    ).toBeInTheDocument();
    expect(container.querySelector('.custom')).not.toBeNull();
    await expectNoA11yViolations(container);
  });
});
