import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DrawerSectionHeading } from './DrawerSectionHeading';

describe('DrawerSectionHeading', () => {
  it('renders a compact Title Case heading with the requested element', async () => {
    const { container } = render(
      <DrawerSectionHeading as='h3'>Contact Info</DrawerSectionHeading>
    );

    expect(screen.getByRole('heading', { name: 'Contact Info' })).toHaveClass(
      'text-xs',
      'tracking-normal'
    );
    await expectNoA11yViolations(container);
  });

  it('outranks sub-headings: semibold secondary, never all caps', async () => {
    const { container } = render(
      <DrawerSectionHeading>Activity</DrawerSectionHeading>
    );
    expect(screen.getByText('Activity')).toHaveClass(
      'font-semibold',
      'text-secondary-token'
    );
    expect(screen.getByText('Activity').className).not.toContain('uppercase');
    await expectNoA11yViolations(container);
  });

  it('lets a long label wrap instead of clipping it', async () => {
    const label =
      'Booking, management and publishing contacts for every territory';
    const { container } = render(
      <div className='w-48'>
        <DrawerSectionHeading as='h3'>{label}</DrawerSectionHeading>
      </div>
    );

    const heading = screen.getByRole('heading', { name: label });
    expect(heading).toHaveClass('leading-4');
    expect(heading.className).not.toMatch(/truncate|whitespace-nowrap/);
    await expectNoA11yViolations(container);
  });

  it('keeps the heading in a right-to-left drawer', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <DrawerSectionHeading as='h3'>معلومات الاتصال</DrawerSectionHeading>
      </div>
    );

    expect(
      screen.getByRole('heading', { name: 'معلومات الاتصال' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
