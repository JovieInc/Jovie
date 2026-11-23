import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { expectFlatState } from '@/tests/utils/flat-state';
import {
  ContactsSectionSkeleton,
  InputSkeleton,
  PixelsSectionSkeleton,
  ProfileSettingsLoading,
  SettingsButtonSkeleton,
  SettingsCardSkeleton,
  SettingsLoadingSkeleton,
  ToggleRowSkeleton,
  TouringSectionSkeleton,
} from './SettingsLoadingSkeleton';

describe('SettingsLoadingSkeleton', () => {
  it('renders the title and description bars at their default widths', async () => {
    const { container } = render(
      <SettingsLoadingSkeleton>
        <span>row</span>
      </SettingsLoadingSkeleton>
    );

    const root = screen.getByTestId('settings-loading-skeleton');
    const [title, description] = Array.from(
      root.querySelectorAll('.mb-4 > .skeleton')
    );
    expect(title).toHaveClass('h-7', 'w-48');
    expect(description).toHaveClass('h-4', 'w-80');
    expect(screen.getByText('row').parentElement).toHaveClass('space-y-4');
    expectFlatState(container);
    await expectNoA11yViolations(container);
  });

  it('applies custom title and description widths', async () => {
    const { container } = render(
      <SettingsLoadingSkeleton titleWidth='w-32' descriptionWidth='w-56'>
        <InputSkeleton width='w-2/3' />
        <SettingsButtonSkeleton width='w-24' />
      </SettingsLoadingSkeleton>
    );

    const root = screen.getByTestId('settings-loading-skeleton');
    const [title, description] = Array.from(
      root.querySelectorAll('.mb-4 > .skeleton')
    );
    expect(title).toHaveClass('w-32');
    expect(description).toHaveClass('w-56');
    expect(root.querySelector('.h-10.w-2\\/3')).not.toBeNull();
    expect(root.querySelector('.h-9.w-24')).not.toBeNull();
    await expectNoA11yViolations(container);
  });

  it('renders the row and card placeholders with their defaults', () => {
    const { container } = render(
      <>
        <InputSkeleton />
        <SettingsButtonSkeleton />
        <ToggleRowSkeleton />
        <SettingsCardSkeleton />
      </>
    );

    expect(container.querySelector('.h-10.w-full')).not.toBeNull();
    expect(container.querySelector('.h-9.w-40')).not.toBeNull();
    expect(container.querySelector('.h-4.w-56')).not.toBeNull();
    expect(container.querySelector('.h-20.w-full.rounded-xl')).not.toBeNull();
  });

  it('renders the profile settings loading page (loading)', async () => {
    const { container } = render(<ProfileSettingsLoading />);

    const root = screen.getByTestId('settings-loading-skeleton');
    expect(root.querySelectorAll('.h-10.skeleton')).toHaveLength(2);
    expect(root.querySelector('.h-9.w-32')).not.toBeNull();
    await expectNoA11yViolations(container);
  });

  it('hides the inline section skeletons from assistive tech', async () => {
    const { container } = render(
      <>
        <TouringSectionSkeleton />
        <PixelsSectionSkeleton />
        <ContactsSectionSkeleton />
      </>
    );

    const sections = Array.from(container.children);
    expect(sections).toHaveLength(3);
    for (const section of sections)
      expect(section).toHaveAttribute('aria-hidden', 'true');
    // Pixels draws three platform cards.
    expect(sections[1].querySelectorAll('.space-y-3.p-4')).toHaveLength(3);
    expectFlatState(sections[1]);
    expectFlatState(sections[2]);
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean with many rows inside an RTL document', async () => {
    const { container } = render(
      <div dir='rtl'>
        <SettingsLoadingSkeleton titleWidth='w-64' descriptionWidth='w-full'>
          <ToggleRowSkeleton labelWidth='w-72' />
          <ToggleRowSkeleton labelWidth='w-40' />
          <SettingsCardSkeleton height='h-32' />
        </SettingsLoadingSkeleton>
      </div>
    );

    expect(container.querySelector('.h-32.rounded-xl')).not.toBeNull();
    await expectNoA11yViolations(container);
  });
});
