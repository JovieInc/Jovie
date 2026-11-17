import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SectionHeading } from './SectionHeading';

describe('SectionHeading', () => {
  it('defaults to a centred large h2', async () => {
    const { container } = render(
      <SectionHeading>Featured Artists</SectionHeading>
    );

    const heading = screen.getByRole('heading', {
      level: 2,
      name: 'Featured Artists',
    });
    expect(heading).toHaveClass(
      'text-center',
      'text-2xl',
      'text-primary-token'
    );
    await expectNoA11yViolations(container);
  });

  it('renders the requested level, size, alignment and id', async () => {
    const { container } = render(
      <section aria-labelledby='releases-heading'>
        <SectionHeading level={3} size='sm' align='left' id='releases-heading'>
          Releases
        </SectionHeading>
      </section>
    );

    const heading = screen.getByRole('heading', { level: 3, name: 'Releases' });
    expect(heading).toHaveAttribute('id', 'releases-heading');
    expect(heading).toHaveClass('text-left', 'text-lg');
    expect(
      screen.getByRole('region', { name: 'Releases' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps a long heading and an Arabic heading whole', async () => {
    const longText =
      'Every release, every playlist pitch and every fan message in one workspace';
    const { container } = render(
      <div>
        <SectionHeading size='xl'>{longText}</SectionHeading>
        <div dir='rtl' lang='ar'>
          <SectionHeading level={3} align='right'>
            فنانون مميزون
          </SectionHeading>
        </div>
      </div>
    );

    expect(
      screen.getByRole('heading', { level: 2, name: longText })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: 'فنانون مميزون' })
    ).toHaveClass('text-right');
    await expectNoA11yViolations(container);
  });
});
