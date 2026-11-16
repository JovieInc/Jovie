import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { Banner } from './Banner';

describe('Banner', () => {
  it('renders a title-only info banner as a polite status without controls', async () => {
    const { container } = render(<Banner title='Imports are paused' />);

    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveAttribute('data-variant', 'info');
    expect(region).toHaveTextContent('Imports are paused');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('announces errors assertively', async () => {
    const { container } = render(
      <Banner
        variant='error'
        title='Import failed'
        description='Try again after checking the Spotify artist link.'
      />
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
    expect(alert).toHaveTextContent(
      'Try again after checking the Spotify artist link.'
    );
    await expectNoA11yViolations(container);
  });

  it('runs the action and dismiss handlers when pressed', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const onDismiss = vi.fn();
    const { container } = render(
      <Banner
        variant='success'
        title='Connection restored'
        description='Review the recovered profile matches.'
        action={{ label: 'Review', onClick: onAction }}
        onDismiss={onDismiss}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Review' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('renders an href action as a link', async () => {
    const { container } = render(
      <Banner
        title='Imports are paused'
        action={{ label: 'View status', href: '/app/settings' }}
      />
    );

    expect(screen.getByRole('link', { name: 'View status' })).toHaveAttribute(
      'href',
      '/app/settings'
    );
    await expectNoA11yViolations(container);
  });

  it('keeps long and right-to-left copy intact', async () => {
    const longTitle =
      'Spotify, Apple Music, YouTube Music and Amazon Music imports are paused while Jovie reconnects to every platform';
    const { container } = render(
      <div dir='rtl'>
        <Banner
          variant='warning'
          title={longTitle}
          description='ستستأنف جوفي مزامنة الإصدارات الجديدة تلقائيًا.'
          onDismiss={() => {}}
        />
      </div>
    );

    const title = screen.getByText(longTitle);
    expect(title).toHaveClass('break-words');
    expect(
      screen.getByText('ستستأنف جوفي مزامنة الإصدارات الجديدة تلقائيًا.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
