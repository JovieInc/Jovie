import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { InfoBox } from './InfoBox';

describe('InfoBox', () => {
  it.each(['info', 'warning', 'success'] as const)(
    'announces the %s notice politely with its title',
    async variant => {
      const { container } = render(
        <InfoBox title='Heads up' variant={variant} testId='box'>
          Review this before proceeding.
        </InfoBox>
      );

      const box = screen.getByTestId('box');
      expect(box).toHaveAttribute('aria-live', 'polite');
      expect(box).not.toHaveAttribute('role');
      expect(box).toHaveAttribute('data-variant', variant);
      expect(
        screen.getByRole('heading', { level: 3, name: 'Heads up' })
      ).toBeInTheDocument();
      await expectNoA11yViolations(container);
    }
  );

  it('announces errors assertively as an alert', async () => {
    const { container } = render(
      <InfoBox title='Error' variant='error'>
        Something went wrong. Please try again.
      </InfoBox>
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
    expect(alert).toHaveTextContent('Something went wrong. Please try again.');
    await expectNoA11yViolations(container);
  });

  it('renders content without a title and in the inline presentation', async () => {
    const { container } = render(
      <InfoBox presentation='inline' variant='success' testId='box'>
        Artist import complete.
      </InfoBox>
    );

    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getByTestId('box')).toHaveAttribute(
      'data-presentation',
      'inline'
    );
    expect(screen.getByText('Artist import complete.')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps a long title and message intact', async () => {
    const title =
      'Your distributor has not confirmed the release date for every territory yet';
    const message =
      'Tidal, Deezer, Amazon Music and Beatport are still processing the delivery; smart links add each store as it confirms.';
    const { container } = render(
      <InfoBox title={title} variant='warning'>
        {message}
      </InfoBox>
    );

    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    expect(screen.getByText(message)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders in a right-to-left layout', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <InfoBox title='معلومات'>هذه رسالة إعلامية لمساعدة المستخدم.</InfoBox>
      </div>
    );

    expect(
      screen.getByRole('heading', { name: 'معلومات' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
