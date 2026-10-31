import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderAdmissionCell } from './column-renderers';

describe('renderAdmissionCell', () => {
  it('names every certification leg that blocks admission', () => {
    render(renderAdmissionCell(['profile', 'design']));
    expect(screen.getByText('Blocked: Profile, Design judge')).toBeDefined();
  });

  it('shows an admissible entry', () => {
    render(renderAdmissionCell([]));
    expect(screen.getByText('Admissible')).toBeDefined();
  });

  it('shows a dash when the entry is not waiting or the gate was unreadable', () => {
    render(renderAdmissionCell(null));
    expect(screen.getByText('-')).toBeDefined();
  });
});
