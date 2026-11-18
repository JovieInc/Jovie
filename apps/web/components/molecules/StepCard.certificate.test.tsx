import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { StepCard } from './StepCard';

const icon = <svg data-testid='icon' aria-hidden='true' />;

describe('StepCard certificate', () => {
  it('renders the defaults: a level-3 title, hover glow and no connection line', async () => {
    const { container } = render(
      <StepCard
        stepNumber='01'
        title='Connect'
        description='Link the profile.'
        icon={icon}
      />
    );

    expect(
      screen.getByRole('heading', { level: 3, name: 'Connect' })
    ).toBeVisible();
    expect(container.firstElementChild?.tagName).toBe('DIV');
    expect(container.firstElementChild).toHaveClass('group');
    expect(container.querySelector('.blur')).not.toBeNull();
    expect(container.querySelector('.max-md\\:hidden')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('honours the wrapper, heading level, line and non-interactive options', async () => {
    const { container } = render(
      <ol>
        <StepCard
          as='li'
          stepNumber='02'
          title='Get Your Link'
          description='Claim your page.'
          icon={icon}
          titleLevel={2}
          showConnectionLine
          interactive={false}
          data-testid='step'
          className='w-72'
        />
      </ol>
    );

    const step = screen.getByTestId('step');
    expect(step.tagName).toBe('LI');
    expect(step).toHaveClass('w-72');
    expect(step).not.toHaveClass('group');
    expect(
      screen.getByRole('heading', { level: 2, name: 'Get Your Link' })
    ).toBeVisible();
    expect(container.querySelector('.max-md\\:hidden')).not.toBeNull();
    expect(container.querySelector('.blur')).toBeNull();
    expect(screen.getByText('Step 02')).toHaveClass('sr-only');
    await expectNoA11yViolations(container);
  });

  it('keeps long and RTL copy axe-clean', async () => {
    const title =
      'Connect every streaming profile and distributor account you already use';
    const { container } = render(
      <div dir='rtl'>
        <StepCard
          stepNumber='03'
          title={title}
          description='ابحث عن ملفك الفني وتحقق منه في ثوانٍ.'
          icon={icon}
        />
      </div>
    );

    expect(screen.getByRole('heading', { name: title })).toBeVisible();
    expect(
      screen.getByText('ابحث عن ملفك الفني وتحقق منه في ثوانٍ.')
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
