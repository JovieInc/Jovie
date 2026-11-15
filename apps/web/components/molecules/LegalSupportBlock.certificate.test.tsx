import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { LegalSupportBlock } from './LegalSupportBlock';

describe('LegalSupportBlock certificate', () => {
  it('uses the secondary text token for its description', async () => {
    const { container } = render(
      <LegalSupportBlock description='We can help.' email='privacy@jov.ie' />
    );
    expect(screen.getByText('We can help.')).toHaveClass(
      'text-secondary-token'
    );
    expect(
      screen.getByRole('link', { name: 'privacy@jov.ie' })
    ).toHaveAttribute('href', 'mailto:privacy@jov.ie');
    await expectNoA11yViolations(container);
  });

  it('renders long RTL copy without violations', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <LegalSupportBlock
          title='هل تحتاج إلى مساعدة؟'
          description='لديك أسئلة حول هذه السياسة؟ فريقنا سعيد بمساعدتك.'
          email='data-protection-requests@jov.ie'
        />
      </div>
    );
    expect(screen.getByText('هل تحتاج إلى مساعدة؟')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
