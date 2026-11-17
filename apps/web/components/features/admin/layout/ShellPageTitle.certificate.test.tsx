import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  HeaderActionsProvider,
  useHeaderActions,
} from '@/contexts/HeaderActionsContext';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ShellPageTitle } from './ShellPageTitle';

function BadgeProbe() {
  const { headerBadge } = useHeaderActions();
  return <p data-testid='badge-probe'>{headerBadge}</p>;
}

describe('ShellPageTitle certificate', () => {
  it('renders no markup of its own and stays axe-clean', async () => {
    const { container } = render(
      <HeaderActionsProvider>
        <main>
          <ShellPageTitle title='Certifications' />
        </main>
        <BadgeProbe />
      </HeaderActionsProvider>
    );

    expect(screen.getByRole('main')).toBeEmptyDOMElement();
    expect(screen.getByTestId('badge-probe')).toHaveTextContent(
      'Certifications'
    );
    await expectNoA11yViolations(container);
  });

  it('follows a title change and clears on unmount', async () => {
    function Harness({ title }: { readonly title: string | null }) {
      return (
        <HeaderActionsProvider>
          {title ? <ShellPageTitle title={title} /> : null}
          <BadgeProbe />
        </HeaderActionsProvider>
      );
    }
    const { rerender, container } = render(<Harness title='Certifications' />);

    rerender(<Harness title='شهادات المسار الذهبي' />);
    expect(screen.getByTestId('badge-probe')).toHaveTextContent(
      'شهادات المسار الذهبي'
    );
    await expectNoA11yViolations(container);

    rerender(<Harness title={null} />);
    expect(screen.getByTestId('badge-probe')).toBeEmptyDOMElement();
  });
});
