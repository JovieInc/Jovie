import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TaskProjectionListRow } from './TaskProjectionListRow';

describe('TaskProjectionListRow', () => {
  const baseProps = {
    testId: 'task-projection-row',
    leading: <span aria-hidden='true'>◷</span>,
    title: 'Cache Symphony workspaces on NVMe',
    metadata: <div>Running · JOV-5544</div>,
    actionSlot: <span>queued → running</span>,
  };

  it('renders title, metadata, and action slot inside the shared row frame', () => {
    render(<TaskProjectionListRow {...baseProps} />);

    expect(screen.getByTestId('task-projection-row')).toBeInTheDocument();
    expect(
      screen.getByText('Cache Symphony workspaces on NVMe')
    ).toBeInTheDocument();
    expect(screen.getByText('Running · JOV-5544')).toBeInTheDocument();
    expect(screen.getByText('queued → running')).toBeInTheDocument();
  });

  it('renders without a title while keeping the metadata row', () => {
    render(<TaskProjectionListRow {...baseProps} title={undefined} />);

    expect(
      screen.queryByText('Cache Symphony workspaces on NVMe')
    ).not.toBeInTheDocument();
    expect(screen.getByText('Running · JOV-5544')).toBeInTheDocument();
  });

  it('applies muted opacity for done rows and quiet for cancelled rows, restored when selected', () => {
    const { container: muted } = render(
      <TaskProjectionListRow {...baseProps} opacity='muted' />
    );
    expect(muted.firstChild).toHaveClass('opacity-75');

    const { container: quiet } = render(
      <TaskProjectionListRow {...baseProps} opacity='quiet' />
    );
    expect(quiet.firstChild).toHaveClass('opacity-60');

    const { container: mutedSelected } = render(
      <TaskProjectionListRow {...baseProps} opacity='muted' isSelected />
    );
    expect(mutedSelected.firstChild).not.toHaveClass('opacity-75');
  });
});
