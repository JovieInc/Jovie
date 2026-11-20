import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { HomeLoopSection } from './HomeLoopSection';

function renderSection(
  props: Partial<React.ComponentProps<typeof HomeLoopSection>> = {}
) {
  const onRetry = vi.fn();
  const view = render(
    <HomeLoopSection
      title='In Flight'
      count={3}
      status='ready'
      isEmpty={false}
      emptyLabel='No work in flight.'
      errorLabel='Shipping data could not load.'
      onRetry={onRetry}
      skeleton={<p data-testid='skeleton'>Loading rows</p>}
      testId='section'
      {...props}
    >
      <p>Section body</p>
    </HomeLoopSection>
  );
  return { ...view, onRetry };
}

describe('HomeLoopSection', () => {
  it('shows the heading, count and body when populated', async () => {
    const { container } = renderSection();

    const section = screen.getByRole('region', { name: /In Flight/ });
    expect(section).toHaveAttribute('data-state', 'populated');
    expect(screen.getByTestId('section-count')).toHaveTextContent('3');
    expect(screen.getByText('Section body')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows the skeleton and no count while loading', async () => {
    const { container } = renderSection({ status: 'loading' });

    expect(screen.getByTestId('section')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('section-count')).toBeNull();
    expect(screen.queryByText('Section body')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('retries from the error alert', async () => {
    const user = userEvent.setup();
    const { container, onRetry } = renderSection({ status: 'error' });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Shipping data could not load.'
    );
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });

  it('offers no retry button without a handler', () => {
    renderSection({ status: 'error', onRetry: undefined });
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows the empty line when ready with nothing to show', async () => {
    const { container } = renderSection({ isEmpty: true, count: 0 });

    expect(screen.getByTestId('section')).toHaveAttribute(
      'data-state',
      'empty'
    );
    expect(screen.getByText('No work in flight.')).toBeInTheDocument();
    expect(screen.queryByText('Section body')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('replaces the empty line with a linked source notice', async () => {
    const { container } = renderSection({
      isEmpty: true,
      notice: '27 sources are unavailable.',
      noticeHref: '/app/ov/inbox',
    });

    expect(screen.getByRole('status')).toHaveTextContent(
      '27 sources are unavailable.'
    );
    expect(screen.getByRole('link', { name: 'View' })).toHaveAttribute(
      'href',
      '/app/ov/inbox'
    );
    expect(screen.queryByText('No work in flight.')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('keeps the body under a notice when partly populated', async () => {
    const { container } = renderSection({ notice: '2 sources failed.' });

    expect(screen.getByTestId('section-notice')).toHaveTextContent(
      '2 sources failed.'
    );
    expect(screen.getByText('Section body')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
