import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DrawerSection } from './DrawerSection';
import {
  DrawerSectionGroup,
  type DrawerSectionGroupProps,
} from './DrawerSectionGroup';

function renderGroup(
  props: Omit<DrawerSectionGroupProps, 'children'> = {},
  titles: readonly [string, string] = ['Facts', 'Links']
) {
  return render(
    <DrawerSectionGroup {...props}>
      <DrawerSection title={titles[0]} sectionId='facts'>
        <p>Fact content.</p>
      </DrawerSection>
      <DrawerSection title={titles[1]} sectionId='links'>
        <p>Link content.</p>
      </DrawerSection>
    </DrawerSectionGroup>
  );
}

describe('DrawerSectionGroup', () => {
  it('starts with every section collapsed by default', async () => {
    const { container } = renderGroup();

    expect(screen.getByRole('button', { name: 'Facts' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(screen.getByRole('button', { name: 'Links' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    await expectNoA11yViolations(container);
  });

  it('keeps one section open at a time', async () => {
    const user = userEvent.setup();
    const { container } = renderGroup({ defaultOpenSectionId: 'facts' });
    const facts = screen.getByRole('button', { name: 'Facts' });
    const links = screen.getByRole('button', { name: 'Links' });

    expect(facts).toHaveAttribute('aria-expanded', 'true');
    await user.click(links);
    expect(links).toHaveAttribute('aria-expanded', 'true');
    expect(facts).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Link content.')).toBeVisible();
    expect(screen.getByText('Fact content.')).not.toBeVisible();
    await expectNoA11yViolations(container);

    await user.click(links);
    expect(links).toHaveAttribute('aria-expanded', 'false');
  });

  it('switches between sections with long titles', async () => {
    const user = userEvent.setup();
    const titles = [
      'Release facts, credits and distribution metadata',
      'Streaming links, presave destinations and store pages',
    ] as const;
    const { container } = renderGroup(
      { defaultOpenSectionId: 'links' },
      titles
    );

    await user.click(screen.getByRole('button', { name: titles[0] }));
    expect(screen.getByRole('button', { name: titles[0] })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(screen.getByRole('button', { name: titles[1] })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    await expectNoA11yViolations(container);
  });

  it('keeps single-open behavior in a right-to-left drawer', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <DrawerSectionGroup defaultOpenSectionId='facts'>
          <DrawerSection title='الحقائق' sectionId='facts'>
            <p>محتوى الحقائق.</p>
          </DrawerSection>
          <DrawerSection title='الروابط' sectionId='links'>
            <p>محتوى الروابط.</p>
          </DrawerSection>
        </DrawerSectionGroup>
      </div>
    );

    await user.click(screen.getByRole('button', { name: 'الروابط' }));
    expect(screen.getByRole('button', { name: 'الحقائق' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    await expectNoA11yViolations(container);
  });
});
