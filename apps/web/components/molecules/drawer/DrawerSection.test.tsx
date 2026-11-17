import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DrawerButton } from './DrawerButton';
import { DrawerSection } from './DrawerSection';

describe('DrawerSection states', () => {
  it('collapses and reopens a titled section', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <DrawerSection title='Metadata' sectionKind='details'>
        <p>Section content goes here.</p>
      </DrawerSection>
    );

    const trigger = screen.getByRole('button', { name: 'Metadata' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expectNoA11yViolations(container);

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Section content goes here.')).not.toBeVisible();
    await expectNoA11yViolations(container);

    await user.click(trigger);
    expect(screen.getByText('Section content goes here.')).toBeVisible();
  });

  it('mounts lazy content the first time a collapsed card opens', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <DrawerSection
        title='Links'
        surface='card'
        defaultOpen={false}
        lazyMount
        testId='links'
      >
        <p>No links added yet.</p>
      </DrawerSection>
    );

    expect(screen.queryByText('No links added yet.')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Links' }));
    expect(screen.getByText('No links added yet.')).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('renders untitled content without a heading or toggle', async () => {
    const { container } = render(
      <DrawerSection surface='card' testId='untitled'>
        <p>Content only</p>
      </DrawerSection>
    );

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getByText('Content only')).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('keeps a long title and its actions in the header', async () => {
    const user = userEvent.setup();
    const title =
      'Streaming links, presave destinations and territory-specific store pages';
    const { container } = render(
      <DrawerSection
        title={title}
        actions={
          <DrawerButton tone='ghost' size='sm'>
            Edit
          </DrawerButton>
        }
      >
        <p>Long section body</p>
      </DrawerSection>
    );

    expect(screen.getByRole('button', { name: 'Edit' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: title }));
    expect(screen.getByRole('button', { name: title })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    await expectNoA11yViolations(container);
  });

  it('collapses in a right-to-left drawer', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <DrawerSection title='البيانات الوصفية'>
          <p>يظهر محتوى القسم هنا.</p>
        </DrawerSection>
      </div>
    );

    await user.click(screen.getByRole('button', { name: 'البيانات الوصفية' }));
    expect(screen.getByText('يظهر محتوى القسم هنا.')).not.toBeVisible();
    await expectNoA11yViolations(container);
  });
});
