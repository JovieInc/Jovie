import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AudienceIntentBadge } from './AudienceIntentBadge';

describe('AudienceIntentBadge certificate', () => {
  it.each([
    ['high', 'High'],
    ['medium', 'Medium'],
    ['low', 'Low'],
  ] as const)('labels the %s intent level', async (intentLevel, label) => {
    const { container } = render(
      <AudienceIntentBadge intentLevel={intentLevel} className='extra' />
    );

    const badge = screen.getByText(label);
    expect(badge.closest('.extra')).not.toBeNull();
    expect(container).toHaveTextContent(label);
    await expectNoA11yViolations(container);
  });

  it('stays accessible beside right-to-left copy', async () => {
    const { container } = render(
      <div dir='rtl'>
        <span>مستوى الاهتمام</span>
        <AudienceIntentBadge intentLevel='medium' />
      </div>
    );

    expect(screen.getByText('Medium')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
