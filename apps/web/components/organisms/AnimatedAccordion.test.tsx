import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AnimatedAccordion } from './AnimatedAccordion';

function Disclosure({ answer }: { readonly answer: string }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div>
      <button
        type='button'
        aria-expanded={isOpen}
        aria-controls='faq-answer'
        onClick={() => setIsOpen(open => !open)}
      >
        Is it free?
      </button>
      <div id='faq-answer'>
        <AnimatedAccordion isOpen={isOpen} className='faq-panel'>
          <p>{answer}</p>
        </AnimatedAccordion>
      </div>
    </div>
  );
}

describe('AnimatedAccordion', () => {
  it('renders nothing while closed, axe-clean', async () => {
    const { container } = render(
      <AnimatedAccordion isOpen={false}>
        <p>Hidden answer</p>
      </AnimatedAccordion>
    );

    expect(screen.queryByText('Hidden answer')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders its children while open, axe-clean', async () => {
    const { container } = render(
      <AnimatedAccordion isOpen className='mt-2'>
        <p>Visible answer</p>
      </AnimatedAccordion>
    );

    expect(screen.getByText('Visible answer')).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('opens and closes with the caller toggle', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <Disclosure answer='Yes, the base plan is free.' />
    );
    const toggle = screen.getByRole('button', { name: 'Is it free?' });

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Yes, the base plan is free.')).toBeVisible();
    await expectNoA11yViolations(container);

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByText('Yes, the base plan is free.')
    ).not.toBeInTheDocument();
  });

  it('keeps long content and right-to-left text axe-clean', async () => {
    const long = 'A long answer that wraps. '.repeat(20).trim();
    const { container } = render(
      <div dir='rtl'>
        <AnimatedAccordion isOpen>
          <p>{long}</p>
          <p>جوفي منصة روابط للفنانين.</p>
        </AnimatedAccordion>
      </div>
    );

    expect(screen.getByText(long)).toBeVisible();
    expect(screen.getByText('جوفي منصة روابط للفنانين.')).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
