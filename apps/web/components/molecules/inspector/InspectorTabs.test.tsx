import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { InspectorTabs } from './InspectorTabs';
import { INSPECTOR_TAB_OPTIONS } from './inspector-tabs';

const baseProps = {
  options: INSPECTOR_TAB_OPTIONS,
  ariaLabel: 'Inspector tabs',
  panelId: 'panel',
};

describe('InspectorTabs', () => {
  it('marks the active tab and keeps others out of the tab order', async () => {
    const { container } = render(
      <>
        <InspectorTabs {...baseProps} value='assets' onValueChange={vi.fn()} />
        <div id='panel' role='tabpanel' aria-label='Assets' />
      </>
    );

    expect(screen.getByTestId('drawer-tab-assets')).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByTestId('drawer-tab-assets')).toHaveAttribute(
      'tabindex',
      '0'
    );
    expect(screen.getByTestId('drawer-tab-details')).toHaveAttribute(
      'tabindex',
      '-1'
    );
    await expectNoA11yViolations(container);
  });

  it('selects a tab on click and renders trailing actions', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const { container } = render(
      <>
        <InspectorTabs
          {...baseProps}
          value='details'
          onValueChange={onValueChange}
          actions={<span>More</span>}
        />
        <div id='panel' role='tabpanel' aria-label='Details' />
      </>
    );

    await user.click(screen.getByRole('tab', { name: 'Links' }));

    expect(onValueChange).toHaveBeenCalledWith('links');
    expect(screen.getByText('More')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('does not select a disabled tab', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <InspectorTabs
        value='details'
        onValueChange={onValueChange}
        ariaLabel='Tabs'
        options={[
          { value: 'details', label: 'Details' },
          { value: 'rights', label: 'Rights', disabled: true },
        ]}
      />
    );

    await user.click(screen.getByRole('tab', { name: 'Rights' }));

    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('moves selection with the arrow keys', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <InspectorTabs
        {...baseProps}
        value='details'
        onValueChange={onValueChange}
      />
    );

    screen.getByTestId('drawer-tab-details').focus();
    await user.keyboard('{ArrowRight}');

    expect(onValueChange).toHaveBeenCalledWith('assets');
  });
});
