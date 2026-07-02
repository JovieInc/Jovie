import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CollapsibleSectionHeading } from '@/components/molecules/drawer/CollapsibleSectionHeading';
import { DrawerSection } from '@/components/molecules/drawer/DrawerSection';
import { DrawerSectionGroup } from '@/components/molecules/drawer/DrawerSectionGroup';

function StatefulChild() {
  const [value, setValue] = useState('draft');

  return (
    <input
      aria-label='Draft title'
      value={value}
      onChange={event => setValue(event.target.value)}
    />
  );
}

describe('CollapsibleSectionHeading', () => {
  it('renders a toggle button with a chevron icon', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <CollapsibleSectionHeading isOpen onToggle={onToggle}>
        Properties
      </CollapsibleSectionHeading>
    );

    expect(
      screen.getByRole('button', { name: 'Properties' })
    ).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('calls onToggle when clicked', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();

    render(
      <CollapsibleSectionHeading isOpen={false} onToggle={onToggle}>
        Labels
      </CollapsibleSectionHeading>
    );

    await user.click(screen.getByRole('button', { name: 'Labels' }));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

describe('DrawerSection', () => {
  it('starts expanded and toggles visibility when the heading is clicked', async () => {
    const user = userEvent.setup();

    render(
      <DrawerSection title='Properties'>
        <div data-testid='drawer-section-content'>Body content</div>
      </DrawerSection>
    );

    const button = screen.getByRole('button', { name: 'Properties' });
    const content = screen.getByTestId('drawer-section-content');

    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(content).toBeVisible();

    await user.click(button);

    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(content).not.toBeVisible();

    await user.click(button);

    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(content).toBeVisible();
  });

  it('renders a static heading when collapsible is false', () => {
    render(
      <DrawerSection title='Details' collapsible={false}>
        <div>Body content</div>
      </DrawerSection>
    );

    expect(
      screen.queryByRole('button', { name: 'Details' })
    ).not.toBeInTheDocument();
    expect(screen.getByText('Details')).toBeInTheDocument();
  });

  it('renders children without a heading when no title is provided', () => {
    render(
      <DrawerSection>
        <div>Body content</div>
      </DrawerSection>
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Body content')).toBeInTheDocument();
  });

  it('preserves child state while collapsed', async () => {
    const user = userEvent.setup();

    render(
      <DrawerSection title='Notes'>
        <StatefulChild />
      </DrawerSection>
    );

    const button = screen.getByRole('button', { name: 'Notes' });
    const input = screen.getByRole('textbox', { name: 'Draft title' });

    await user.clear(input);
    await user.type(input, 'saved state');
    await user.click(button);

    expect(input).not.toBeVisible();

    await user.click(button);

    expect(input).toHaveValue('saved state');
  });

  it('keeps only one section open inside a DrawerSectionGroup', async () => {
    const user = userEvent.setup();

    render(
      <DrawerSectionGroup defaultOpenSectionId='one'>
        <DrawerSection sectionId='one' title='One' defaultOpen={false}>
          <div data-testid='section-one'>One</div>
        </DrawerSection>
        <DrawerSection sectionId='two' title='Two' defaultOpen={false}>
          <div data-testid='section-two'>Two</div>
        </DrawerSection>
      </DrawerSectionGroup>
    );

    expect(screen.getByTestId('section-one')).toBeVisible();
    expect(screen.getByTestId('section-two')).not.toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Two' }));

    expect(screen.getByTestId('section-one')).not.toBeVisible();
    expect(screen.getByTestId('section-two')).toBeVisible();
  });
});
