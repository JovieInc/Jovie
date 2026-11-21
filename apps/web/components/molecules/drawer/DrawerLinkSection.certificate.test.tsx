import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DrawerLinkSection } from './DrawerLinkSection';

describe('DrawerLinkSection certificate', () => {
  it('calls onAdd from the labelled add button', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    const { container } = render(
      <DrawerLinkSection title='Links' onAdd={onAdd} addLabel='Add DSP link'>
        <div>Spotify</div>
      </DrawerLinkSection>
    );

    await user.click(screen.getByRole('button', { name: 'Add DSP link' }));

    expect(onAdd).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('hides the heading visually but keeps it for screen readers', async () => {
    const { container } = render(
      <DrawerLinkSection title='Links' showHeading={false} onAdd={vi.fn()}>
        <div>Spotify</div>
      </DrawerLinkSection>
    );

    expect(screen.getByText('Links')).toHaveClass('sr-only');
    expect(screen.getByRole('button', { name: 'Add link' })).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('shows the empty message in place of the links', async () => {
    const { container } = render(
      <DrawerLinkSection title='Links' isEmpty emptyMessage='Nothing yet.'>
        <div>Spotify</div>
      </DrawerLinkSection>
    );

    expect(screen.getByText('Nothing yet.')).toBeInTheDocument();
    expect(screen.queryByText('Spotify')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
