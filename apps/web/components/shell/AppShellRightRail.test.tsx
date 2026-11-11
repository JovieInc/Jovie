import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AppShellRightRail } from './AppShellRightRail';

describe('AppShellRightRail certificate', () => {
  it('labels the rail as the context panel and is axe-clean', async () => {
    const { container } = render(
      <AppShellRightRail>
        <p>Entity details</p>
      </AppShellRightRail>
    );

    const rail = screen.getByRole('complementary', { name: 'Context Panel' });
    expect(rail).not.toHaveAttribute('data-rail-below-header');
    expect(rail).toHaveTextContent('Entity details');
    await expectNoA11yViolations(container);
  });

  it('keeps a preview below the shell header when asked', async () => {
    const { container } = render(
      <AppShellRightRail belowHeader className='fixture-rail'>
        <p>Preview</p>
      </AppShellRightRail>
    );

    const rail = screen.getByTestId('app-shell-right-rail');
    expect(rail).toHaveAttribute('data-rail-below-header', 'true');
    expect(rail).toHaveClass('fixture-rail', 'shell-inspector-rail');
    await expectNoA11yViolations(container);
  });

  it('clips long panels inside the rail without losing them', async () => {
    const items = Array.from(
      { length: 40 },
      (_, index) => `Pitch update ${index + 1}`
    ).map(line => <li key={line}>{line}</li>);
    const { container } = render(
      <AppShellRightRail>
        <ul>{items}</ul>
      </AppShellRightRail>
    );

    expect(screen.getAllByRole('listitem')).toHaveLength(40);
    expect(screen.getByRole('list').parentElement).toHaveClass(
      'h-full',
      'min-h-0',
      'min-w-0'
    );
    await expectNoA11yViolations(container);
  });

  it('carries right-to-left panel content and is axe-clean', async () => {
    const { container } = render(
      <AppShellRightRail>
        <div dir='rtl' lang='ar'>
          تفاصيل الإصدار
        </div>
      </AppShellRightRail>
    );

    expect(screen.getByText('تفاصيل الإصدار')).toHaveAttribute('dir', 'rtl');
    await expectNoA11yViolations(container);
  });
});
