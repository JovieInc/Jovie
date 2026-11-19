import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SentryExamplePage from './page';

describe('SentryExamplePage', () => {
  it('renders the client Sentry capture scaffold without an all-caps eyebrow', () => {
    render(<SentryExamplePage />);
    expect(screen.getByText('Sentry Example')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Throw sample error' })
    ).toBeInTheDocument();
  });
});
