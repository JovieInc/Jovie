import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { GtmCollapsibles } from './GtmCollapsibles';

// The status panel and the six lazy panels have their own tests; here each is
// a marker so the accordion's own behavior is what is measured.
vi.mock('./GrowthStatusPanel', () => ({
  GrowthStatusPanel: () => <p>Growth status</p>,
}));
vi.mock('next/dynamic', () => ({
  default: () =>
    function LazyPanel(props: Record<string, unknown>) {
      return <p data-testid='lazy-panel'>{JSON.stringify(props)}</p>;
    },
}));
vi.mock('@/components/organisms/AnimatedAccordion', () => ({
  AnimatedAccordion: ({
    isOpen,
    children,
  }: {
    readonly isOpen: boolean;
    readonly children: ReactNode;
  }) => <div hidden={!isOpen}>{children}</div>,
}));

const toggle = (name: string) => screen.getByRole('button', { name });
const panels = () => screen.queryAllByTestId('lazy-panel');

describe('GtmCollapsibles', () => {
  it('starts with every section closed and nothing lazy mounted, axe-clean', async () => {
    const { container } = render(<GtmCollapsibles />);

    expect(screen.getByText('Growth status')).toBeInTheDocument();
    for (const name of [
      'Intake & Keywords',
      'Advanced Settings',
      'Outreach & Campaigns',
    ]) {
      expect(toggle(name)).toHaveAttribute('aria-expanded', 'false');
    }
    expect(panels()).toHaveLength(0);
    await expectNoA11yViolations(container);
  });

  it('opens a section on click, mounts its panels and keeps them when closed', async () => {
    const user = userEvent.setup();
    const { container } = render(<GtmCollapsibles />);

    await user.click(toggle('Advanced Settings'));
    expect(toggle('Advanced Settings')).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(panels()).toHaveLength(2);
    expect(panels()[0]).toHaveTextContent(
      JSON.stringify({ hideMainSwitch: true, embedded: true })
    );
    expect(panels()[0]).toBeVisible();
    await expectNoA11yViolations(container);

    await user.click(toggle('Advanced Settings'));
    expect(toggle('Advanced Settings')).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(panels()).toHaveLength(2);
    expect(panels()[0]).not.toBeVisible();
  });

  it('opens sections independently of each other', async () => {
    const user = userEvent.setup();
    render(<GtmCollapsibles />);

    await user.click(toggle('Intake & Keywords'));
    await user.click(toggle('Outreach & Campaigns'));

    expect(toggle('Intake & Keywords')).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(toggle('Outreach & Campaigns')).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(toggle('Advanced Settings')).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(panels()).toHaveLength(4);
    expect(panels()[0]).toHaveTextContent(
      JSON.stringify({ initialMode: 'single' })
    );
  });

  it('opens intake in queue mode for the ingest view, axe-clean', async () => {
    const { container } = render(<GtmCollapsibles initialOpen='ingest' />);

    expect(toggle('Intake & Keywords')).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(panels()).toHaveLength(2);
    expect(panels()[0]).toHaveTextContent(
      JSON.stringify({ initialMode: 'queue' })
    );
    await expectNoA11yViolations(container);
  });

  it('opens outreach when the view changes and ignores unknown views', async () => {
    const { rerender } = render(<GtmCollapsibles initialOpen='leads' />);
    expect(panels()).toHaveLength(0);

    rerender(<GtmCollapsibles initialOpen='campaigns' />);
    expect(toggle('Outreach & Campaigns')).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(panels()).toHaveLength(2);

    rerender(<GtmCollapsibles initialOpen='outreach' />);
    expect(panels()).toHaveLength(2);
  });
});
