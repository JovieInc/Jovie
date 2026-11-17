import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { CTASection } from './CTASection';

const baseProps = {
  title: 'Ready to grow your fanbase?',
  buttonText: 'Get started',
  buttonHref: '/start',
};

describe('CTASection', () => {
  it('labels the section by its heading and links the action, axe-clean', async () => {
    const { container } = render(
      <CTASection {...baseProps} description='Free forever on the base plan.' />
    );

    expect(
      screen.getByRole('region', { name: 'Ready to grow your fanbase?' })
    ).toHaveClass('border-t', 'bg-base');
    expect(screen.getByText('Free forever on the base plan.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Get started' })).toHaveAttribute(
      'href',
      '/start'
    );
    await expectNoA11yViolations(container);
  });

  it('omits the description when none is passed, axe-clean', async () => {
    const { container } = render(<CTASection {...baseProps} />);

    const section = screen.getByRole('region', {
      name: 'Ready to grow your fanbase?',
    });
    expect(section.querySelectorAll('p')).toHaveLength(0);
    await expectNoA11yViolations(container);
  });

  it('uses the secondary surface and keeps the link focusable', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <CTASection {...baseProps} variant='secondary' className='mt-8' />
    );

    expect(
      screen.getByRole('region', { name: 'Ready to grow your fanbase?' })
    ).toHaveClass('bg-surface-0', 'mt-8');
    await user.tab();
    expect(screen.getByRole('link', { name: 'Get started' })).toHaveFocus();
    await expectNoA11yViolations(container);
  });

  it('keeps long and right-to-left copy axe-clean', async () => {
    const description = 'Long supporting copy that wraps. '.repeat(8).trim();
    const { container } = render(
      <div dir='rtl'>
        <CTASection
          title='هل أنت مستعد لتنمية جمهورك؟'
          buttonText='ابدأ الآن'
          buttonHref='/start'
          description={description}
        />
      </div>
    );

    expect(screen.getByText(description)).toBeVisible();
    expect(screen.getByRole('link', { name: 'ابدأ الآن' })).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
