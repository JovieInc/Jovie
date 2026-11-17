import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { LabelPills } from './LabelPills';

describe('LabelPills certificate', () => {
  it('shows the first label and a hidden-from-AT +N count, axe-clean', async () => {
    const { container } = render(
      <LabelPills labels={['backend', 'infra', 'urgent']} />
    );
    expect(screen.getByText('backend')).toBeInTheDocument();
    expect(screen.getByText('+2')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('infra').parentElement).toHaveClass('hidden');
    await expectNoA11yViolations(container);
  });

  it('renders nothing for an empty label list', () => {
    const { container } = render(<LabelPills labels={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('keeps a single label free of the collapse chip', async () => {
    const { container } = render(<LabelPills labels={['backend']} />);
    expect(screen.queryByText(/^\+\d+$/)).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('keeps long and RTL label lists axe-clean', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <LabelPills
          labels={['release-week-marketing-push', 'playlist pitching', 'radio']}
        />
        <LabelPills labels={['تسويق', 'صحافة']} />
      </div>
    );
    expect(screen.getByText('release-week-marketing-push')).toHaveClass(
      'whitespace-nowrap'
    );
    expect(screen.getByText('تسويق')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
