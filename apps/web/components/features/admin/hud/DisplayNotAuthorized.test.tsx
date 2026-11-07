import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DisplayNotAuthorized } from './DisplayNotAuthorized';

describe('DisplayNotAuthorized', () => {
  it('says the display is not authorized and shows no company data', () => {
    render(<DisplayNotAuthorized />);
    expect(
      screen.getByText('This display is not authorized.')
    ).toBeInTheDocument();
  });
});
