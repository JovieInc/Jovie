import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ToolbarFilterSuggestions } from './ToolbarFilterSuggestions';

describe('ToolbarFilterSuggestions', () => {
  it('applies the chosen suggestion only', async () => {
    const user = userEvent.setup();
    const onDraft = vi.fn();
    const onReleases = vi.fn();
    const { container } = render(
      <ToolbarFilterSuggestions
        suggestions={[
          { id: 'draft', label: 'Status · Draft', onSelect: onDraft },
          {
            id: 'releases',
            label: 'Type · Releases',
            ariaLabel: 'Filter to releases',
            onSelect: onReleases,
          },
        ]}
      />
    );

    await user.click(
      screen.getByRole('button', { name: 'Filter to releases' })
    );
    expect(onReleases).toHaveBeenCalledTimes(1);
    expect(onDraft).not.toHaveBeenCalled();

    screen.getByRole('button', { name: 'Status · Draft' }).focus();
    await user.keyboard('{Enter}');
    expect(onDraft).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('takes hidden suggestions out of the tab order without unmounting them', async () => {
    const { container } = render(
      <ToolbarFilterSuggestions
        hidden
        data-testid='suggestions'
        suggestions={[
          { id: 'draft', label: 'Status · Draft', onSelect: vi.fn() },
        ]}
      />
    );

    const row = screen.getByTestId('suggestions');
    expect(row).toHaveAttribute('aria-hidden', 'true');
    expect(row).toHaveClass('pointer-events-none');
    expect(
      screen.getByRole('button', { name: 'Status · Draft', hidden: true })
    ).toHaveAttribute('tabindex', '-1');
    await expectNoA11yViolations(container);
  });

  it('renders nothing without suggestions', () => {
    const { container } = render(<ToolbarFilterSuggestions suggestions={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('stays axe-clean with RTL suggestions', async () => {
    const { container } = render(
      <div dir='rtl'>
        <ToolbarFilterSuggestions
          className='custom'
          suggestions={[
            { id: 'draft', label: 'الحالة · مسودة', onSelect: vi.fn() },
          ]}
        />
      </div>
    );

    expect(
      screen.getByRole('button', { name: 'الحالة · مسودة' })
    ).toBeInTheDocument();
    expect(container.querySelector('.custom')).not.toBeNull();
    await expectNoA11yViolations(container);
  });
});
